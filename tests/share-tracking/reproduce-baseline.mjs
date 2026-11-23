import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const tree = '2fe4aa54c4641ef560be946b16410c11dab80806'
const source = execFileSync('git', ['show', tree + ':src/lib/share/tracking.ts'], { encoding: 'utf8' })
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context, { timeout: 2000 })
const cases = []
for (const failure of ['social_shares', 'point_transactions']) {
  const writes = []
  const database = { from: table => ({ insert: async () => {
    writes.push(table)
    return { data: null, error: table === failure ? { message: 'Synthetic rejected write' } : null }
  } }) }
  let rejected = false
  try { await context.exports.trackShare(database, 'synthetic-user', 'ref-a', 'native', 400, 'natif') }
  catch { rejected = true }
  cases.push({ failure, expected_rejection: true, actual_rejection: rejected,
    attempted_writes: writes, defect_reproduced: !rejected })
}
const result = { scope: 'Original versioned function with inert database doubles; no provider or SQL execution',
  source_tree: tree, source_sha256: createHash('sha256').update(source).digest('hex'),
  cases, file_writes: ['tests/share-tracking/evidence/baseline.json'], provider_calls: 0 }
mkdirSync(new URL('./evidence/', import.meta.url), { recursive: true })
writeFileSync(new URL('./evidence/baseline.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
process.stdout.write(JSON.stringify(result) + '\n')
if (cases.some(row => !row.defect_reproduced)) process.exitCode = 1
