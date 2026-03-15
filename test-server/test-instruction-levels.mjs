/**
 * Integration Test: Instruction Levels + Filtered Instructions
 *
 * Starts the server with different --tool-filter values and verifies that
 * filtered instructions are shorter than unfiltered and contain/exclude
 * the expected sections.
 *
 * Usage:
 *   npm run build
 *   node test-server/test-instruction-levels.mjs
 *
 * Requires: POSTGRES_CONNECTION_STRING or DATABASE_URL env var
 */

import { spawn } from 'child_process'

const PROJECT_DIR = 'C:\\Users\\chris\\Desktop\\postgres-mcp'

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

    // Filtered should NOT contain sections for disabled groups
    const shouldExclude = [
        'JSONB Tools',
        'Vector Tools',
        'Stats Tools',
        'PostGIS Tools',
        'Performance Tools',
        'Backup Tools',
        'pg_partman Tools',
        'pg_stat_kcache Tools',
        'citext Tools',
        'ltree Tools',
        'pgcrypto Tools',
        'Cron Tools',
    ]
    for (const section of shouldExclude) {
        const found = coreOnly.text.includes(section)
        console.log(`  Excludes "${section}": ${found ? '❌ FOUND' : '✅'}`)
        if (found) allPassed = false
    }

    // Filtered SHOULD contain _always sections
    const shouldInclude = ['Critical Gotchas', 'Code Mode Sandbox']
    for (const section of shouldInclude) {
        const found = coreOnly.text.includes(section)
        console.log(`  Includes "${section}": ${found ? '✅' : '❌ MISSING'}`)
        if (!found) allPassed = false
    }

    // ── Test 2: Multi-group filter ──
    console.log('\n=== Test 2: Multi-group Filter ===\n')

    const starterFilter = await testServer(['--tool-filter', 'starter'])
    console.log(`  starter preset: ${starterFilter.charCount} chars (~${starterFilter.tokenEstimate} tokens)`)

    const starterSmaller = starterFilter.charCount < fullAll.charCount
    console.log(`  starter < all: ${starterSmaller ? '✅' : '❌'}`)
    if (!starterSmaller) allPassed = false

    // starter = core + transactions + jsonb + schema + codemode
    // Should include JSONB and Schema sections
    const starterIncludes = ['JSONB Tools', 'Schema Tools', 'Transactions']
    for (const section of starterIncludes) {
        const found = starterFilter.text.includes(section)
        console.log(`  starter includes "${section}": ${found ? '✅' : '❌ MISSING'}`)
        if (!found) allPassed = false
    }

    // ── Summary ──
    console.log(`\n=== Overall: ${allPassed ? '✅ ALL PASSED' : '❌ FAILURES'} ===`)
    process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
    console.error('Fatal:', err.message)
    process.exit(1)
})
