/**
 * Integration Test: Instruction Levels + Filtered Instructions
 *
 * Starts the server with different --tool-filter and --instruction-level
 * values and verifies that filtered instructions are shorter than unfiltered
 * and contain/exclude the expected sections.
 *
 * Usage:
 *   npm run build
 *   node test-server/test-instruction-levels.mjs
 *
 * Requires: POSTGRES_CONNECTION_STRING or DATABASE_URL env var
 */

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = resolve(__dirname, '..', '..')

// Ensure DB connection env vars are present (inherit from shell or use Docker defaults)
if (!process.env.POSTGRES_CONNECTION_STRING && !process.env.DATABASE_URL) {
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'postgres'
    process.env.POSTGRES_USER = process.env.POSTGRES_USER || process.env.PGUSER || 'postgres'
    process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || process.env.PGDATABASE || 'postgres'
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.PGHOST || '127.0.0.1'
}

/**
 * Start server with given args, send initialize, return instruction text
 */
function testServer(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['dist/cli.js', ...args], {
            cwd: PROJECT_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        let buffer = ''
        proc.stdout.on('data', (chunk) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                try {
                    const msg = JSON.parse(trimmed)
                    if (msg.id === 1 && msg.result) {
                        const instructions =
                            msg.result?.serverInfo?.instructions || msg.result?.instructions || ''
                        const capInstructions = msg.result?.capabilities?.instructions || ''
                        const text = instructions || capInstructions

                        proc.kill()
                        resolve({
                            charCount: text.length,
                            tokenEstimate: Math.round(text.length / 4),
                            text,
                        })
                    }
                } catch {
                    // Not complete JSON yet
                }
            }
        })

        proc.stderr.on('data', () => {})

        // Send initialize request
        proc.stdin.write(
            JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: { name: 'instruction-test', version: '1.0' },
                },
            }) + '\n'
        )

        proc.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                reject(new Error(`Server exited prematurely with code ${code} (ensure PostgreSQL is running on 5432)`))
            }
        })

        setTimeout(() => {
            proc.kill()
            reject(new Error(`Timeout for args: ${args.join(' ')}`))
        }, 15000)
    })
}

async function main() {
    let allPassed = true

    // ── Test 1: Unfiltered vs Filtered ──
    console.log('=== Test 1: Filtered Instructions (--tool-filter) ===\n')

    const fullAll = await testServer([])
    console.log(`  all groups: ${fullAll.charCount} chars (~${fullAll.tokenEstimate} tokens)`)

    const coreOnly = await testServer(['--tool-filter', 'core'])
    console.log(`  core only:  ${coreOnly.charCount} chars (~${coreOnly.tokenEstimate} tokens)`)

    // Filtered should be shorter
    const filterReduced = coreOnly.charCount < fullAll.charCount
    const savings = fullAll.charCount - coreOnly.charCount
    const pct = ((savings / fullAll.charCount) * 100).toFixed(1)
    console.log(`\n  Filtered < unfiltered: ${filterReduced ? '✅' : '❌'} (saved ${savings} chars, ${pct}%)`)
    if (!filterReduced) allPassed = false

    // Core includes Code Mode (auto-injected in whitelist mode)
    const coreHasCodeMode = coreOnly.text.includes('## Code Mode')
    console.log(`  Core includes Code Mode: ${coreHasCodeMode ? '✅' : '❌ MISSING'}`)
    if (!coreHasCodeMode) allPassed = false

    // Full should contain Code Mode section
    const fullHasCodeMode = fullAll.text.includes('## Code Mode')
    console.log(`  Full includes Code Mode: ${fullHasCodeMode ? '✅' : '❌ MISSING'}`)
    if (!fullHasCodeMode) allPassed = false

    // Filtered SHOULD contain always-present sections
    const shouldInclude = ['Quick Access', 'Built-in Tools']
    for (const section of shouldInclude) {
        const found = coreOnly.text.includes(section)
        console.log(`  Includes "${section}": ${found ? '✅' : '❌ MISSING'}`)
        if (!found) allPassed = false
    }

    // ── Test 2: Multi-group filter ──
    console.log('\n=== Test 2: Multi-group Filter ===\n')

    const starterFilter = await testServer(['--tool-filter', 'core,transactions,jsonb,schema,codemode'])
    console.log(`  explicit groups: ${starterFilter.charCount} chars (~${starterFilter.tokenEstimate} tokens)`)

    const starterSmaller = starterFilter.charCount < fullAll.charCount
    console.log(`  explicit groups < all: ${starterSmaller ? '✅' : '❌'}`)
    if (!starterSmaller) allPassed = false

    // groups include codemode
    const starterHasCodeMode = starterFilter.text.includes('## Code Mode')
    console.log(`  explicit groups includes Code Mode: ${starterHasCodeMode ? '✅' : '❌ MISSING'}`)
    if (!starterHasCodeMode) allPassed = false

    // ── Test 3: Instruction Levels ──
    console.log('\n=== Test 3: Instruction Levels (--instruction-level) ===\n')

    const essential = await testServer(['--instruction-level', 'essential'])
    console.log(`  essential: ${essential.charCount} chars (~${essential.tokenEstimate} tokens)`)

    const standard = await testServer(['--instruction-level', 'standard'])
    console.log(`  standard:  ${standard.charCount} chars (~${standard.tokenEstimate} tokens)`)

    const full = await testServer(['--instruction-level', 'full'])
    console.log(`  full:      ${full.charCount} chars (~${full.tokenEstimate} tokens)`)

    // essential <= standard <= full
    const levelOrdering = essential.charCount <= standard.charCount && standard.charCount <= full.charCount
    console.log(`\n  essential ≤ standard ≤ full: ${levelOrdering ? '✅' : '❌'}`)
    if (!levelOrdering) allPassed = false

    // essential should NOT have help group listing
    const essentialHasHelp = essential.text.includes('postgres://help/{group}')
    console.log(`  essential excludes help group list: ${essentialHasHelp ? '❌ FOUND' : '✅'}`)
    if (essentialHasHelp) allPassed = false

    // full should have active tools summary
    const fullHasActive = full.text.includes('## Active Tools')
    console.log(`  full includes Active Tools: ${fullHasActive ? '✅' : '❌ MISSING'}`)
    if (!fullHasActive) allPassed = false

    // standard should NOT have active tools summary
    const standardHasActive = standard.text.includes('## Active Tools')
    console.log(`  standard excludes Active Tools: ${standardHasActive ? '❌ FOUND' : '✅'}`)
    if (standardHasActive) allPassed = false

    // ── Summary ──
    console.log(`\n=== Overall: ${allPassed ? '✅ ALL PASSED' : '❌ FAILURES'} ===`)
    process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
    console.error('Fatal:', err.message)
    process.exit(1)
})
