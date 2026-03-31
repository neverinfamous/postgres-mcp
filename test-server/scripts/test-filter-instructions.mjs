/**
 * Filter-Aware Instruction Validation
 *
 * Starts the server with various --tool-filter and --instruction-level configs
 * and verifies that each instruction section is correctly included or excluded
 * based on enabled tool groups and instruction level.
 *
 * Validated sections:
 *   CORE         — always present (Quick Access, Built-in Tools, Help Resources heading)
 *   CODE_MODE    — only when `codemode` group is enabled
 *   HELP_GROUPS  — dynamic group list, standard+ level, only lists enabled groups
 *   ACTIVE_TOOLS — full level only, lists active groups summary
 *
 * Usage:
 *   npm run build && node test-server/test-filter-instructions.mjs
 *
 * Requires: POSTGRES_CONNECTION_STRING or DATABASE_URL env var
 */

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = resolve(__dirname, '..')

// Ensure DB connection env vars are present (inherit from shell or use Docker defaults)
if (!process.env.POSTGRES_CONNECTION_STRING && !process.env.DATABASE_URL) {
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'
    process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? process.env.PGUSER ?? 'postgres'
    process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE ?? process.env.PGDATABASE ?? 'postgres'
}

// Section markers — substrings we check for presence/absence in instructions
const SECTIONS = {
    CORE: '## Quick Access', // Always present
    CODE_MODE: '## Code Mode', // codemode group only
    HELP_GROUPS: 'postgres://help/{group}', // standard+ level, with group list
    ACTIVE_TOOLS: '## Active Tools', // full level only
}

// Test matrix: each entry defines a filter config and expected section presence
const TEST_CONFIGS = [
    {
        label: 'full (all groups, standard level)',
        filter: null,
        level: null, // default = standard
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: false,
        },
    },
    {
        label: 'full (all groups, essential level)',
        filter: null,
        level: 'essential',
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: false,
            ACTIVE_TOOLS: false,
        },
    },
    {
        label: 'full (all groups, full level)',
        filter: null,
        level: 'full',
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: true,
        },
    },
    {
        label: 'core only (codemode auto-injected)',
        filter: 'core',
        level: null,
        expect: {
            CORE: true,
            CODE_MODE: true, // codemode auto-injected in whitelist mode
            HELP_GROUPS: false, // core+codemode have no help content entries
            ACTIVE_TOOLS: false,
        },
    },
    {
        label: 'multiple groups test (core,transactions,jsonb,schema,codemode)',
        filter: 'core,transactions,jsonb,schema,codemode',
        level: null,
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: false,
        },
    },
    {
        label: 'multiple groups test + full level',
        filter: 'core,transactions,jsonb,schema,codemode',
        level: 'full',
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: true,
        },
    },
    {
        label: 'blacklist -codemode (no code mode)',
        filter: '-codemode',
        level: null,
        expect: {
            CORE: true,
            CODE_MODE: false,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: false,
        },
    },
    {
        label: 'blacklist -vector,-postgis (groups absent from help)',
        filter: '-vector,-postgis',
        level: null,
        expect: {
            CORE: true,
            CODE_MODE: true,
            HELP_GROUPS: true,
            ACTIVE_TOOLS: false,
        },
        // Additional validation: vector and postgis should NOT appear in help pointers
        helpExcludes: ['vector', 'postgis'],
    },
]

/** Spawn server with given filter/level, send initialize, capture instructions */
function runConfig(filter, level) {
    return new Promise((resolve, reject) => {
        const args = ['dist/cli.js']
        if (filter) args.push('--tool-filter', filter)
        if (level) args.push('--instruction-level', level)

        const proc = spawn('node', args, {
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
                            msg.result?.serverInfo?.instructions ||
                            msg.result?.instructions ||
                            msg.result?.capabilities?.instructions ||
                            ''
                        proc.kill()
                        resolve(instructions)
                    }
                } catch {
                    // Incomplete JSON, keep buffering
                }
            }
        })

        proc.stderr.on('data', () => {})

        proc.stdin.write(
            JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: { name: 'filter-instruction-test', version: '1.0' },
                },
            }) + '\n'
        )

        setTimeout(() => {
            proc.kill()
            reject(new Error('Timeout'))
        }, 15000)
    })
}

function tokenEstimate(text) {
    return Math.round(text.length / 4)
}

function checkSections(instructions, expect) {
    const results = {}
    for (const [key, marker] of Object.entries(SECTIONS)) {
        const present = instructions.includes(marker)
        const shouldBePresent = expect[key]
        results[key] = {
            present,
            expected: shouldBePresent,
            pass: present === shouldBePresent,
        }
    }
    return results
}

async function main() {
    console.log('=== Filter-Aware Instruction Validation ===\n')
    console.log('Checking that instruction sections are correctly included/excluded')
    console.log('per enabled tool groups and instruction level.\n')

    let totalPassed = 0
    let totalFailed = 0
    const rows = []

    for (const config of TEST_CONFIGS) {
        process.stdout.write(`  Testing: ${config.label} ... `)
        let instructions
        try {
            instructions = await runConfig(config.filter, config.level)
        } catch (err) {
            console.log(`❌ ERROR: ${err.message}`)
            totalFailed++
            continue
        }

        const chars = instructions.length
        const tokens = tokenEstimate(instructions)
        const sectionResults = checkSections(instructions, config.expect)

        // Check help excludes if specified
        let helpExcludeFailures = []
        if (config.helpExcludes) {
            for (const group of config.helpExcludes) {
                // The group name should not appear in the help pointers line
                const helpLine = instructions.split('\n').find((l) => l.includes('postgres://help/{group}'))
                if (helpLine && helpLine.includes(group)) {
                    helpExcludeFailures.push(group)
                }
            }
        }

        const sectionFailures = Object.entries(sectionResults).filter(([, r]) => !r.pass)
        const allPass = sectionFailures.length === 0 && helpExcludeFailures.length === 0

        if (allPass) {
            console.log(`✅ (${chars} chars, ~${tokens} tokens)`)
            totalPassed++
        } else {
            console.log(`❌ (${chars} chars, ~${tokens} tokens)`)
            totalFailed++
            for (const [section, result] of sectionFailures) {
                const action = result.expected ? 'MISSING' : 'UNEXPECTED'
                console.log(
                    `      [${action}] ${section} — expected ${result.expected ? 'present' : 'absent'}, got ${result.present ? 'present' : 'absent'}`
                )
                console.log(`        marker: "${SECTIONS[section]}"`)
            }
            for (const group of helpExcludeFailures) {
                console.log(`      [UNEXPECTED] help pointer for "${group}" — should be excluded by filter`)
            }
        }

        rows.push({ label: config.label, chars, tokens, pass: allPass, sectionResults })
    }

    // Token summary table
    console.log('\n=== Token Estimates by Filter ===\n')
    console.log(
        `  ${'Filter'.padEnd(55)} ${'Chars'.padStart(6)} ${'~Tokens'.padStart(8)} ${'Sections'.padStart(30)}`
    )
    console.log(`  ${'-'.repeat(55)} ${'-'.repeat(6)} ${'-'.repeat(8)} ${'-'.repeat(30)}`)
    for (const row of rows) {
        const sectionSummary = Object.entries(row.sectionResults)
            .map(([k, r]) => (r.present ? k.toLowerCase().replace('_', '-').slice(0, 8) : null))
            .filter(Boolean)
            .join('+')
        console.log(
            `  ${row.label.padEnd(55)} ${String(row.chars).padStart(6)} ${String(row.tokens).padStart(8)}   ${sectionSummary}`
        )
    }

    console.log(`\n=== Results: ${totalPassed} passed, ${totalFailed} failed ===\n`)
    process.exit(totalFailed > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error('Fatal:', err.message)
    process.exit(1)
})
