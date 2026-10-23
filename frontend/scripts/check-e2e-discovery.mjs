// Fails when an e2e spec is not picked up by any Playwright project.
//
// CI ([2.0] E2E) runs a bare `npx playwright test`, i.e. every project in
// playwright.config.ts, and each project only takes the files its `testMatch`
// names. A spec that no pattern matches is silently never run. This asks
// Playwright itself which files it discovers (`--list`, so testDir /
// testMatch / testIgnore are honoured exactly) and compares that with the
// spec files on disk. Files or directories starting with `_` are ad-hoc
// helpers and compare tools, deliberately left out of the suite.
//
// Needs neither browsers nor the e2e stack: `--list` does not launch a
// browser or run globalSetup.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

const res = spawnSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
let report = null
try {
  report = JSON.parse(res.stdout)
} catch {
  // Reported below, together with the exit status.
}
// Config/load errors (e.g. a test.only under forbidOnly) come back as JSON with a
// non-zero exit; print them first, they are the useful part.
for (const e of report?.errors ?? []) console.error(e.message)
// Fail closed: only a clean exit with a parseable, error-free report counts.
if (res.status !== 0 || res.signal || !report || report.errors.length > 0) {
  const stderrTail = (res.stderr ?? '').trim().split('\n').slice(-20).join('\n')
  console.error(
    `playwright --list failed (status ${res.status}, signal ${res.signal ?? 'none'}` +
      `${report ? '' : ', no JSON report'})` +
      `${res.error ? `\n${res.error}` : ''}${stderrTail ? `\n${stderrTail}` : ''}`,
  )
  process.exit(1)
}

const listed = new Set()
const collect = (suite) => {
  for (const spec of suite.specs ?? []) listed.add(spec.file)
  for (const child of suite.suites ?? []) collect(child)
}
report.suites.forEach(collect)

const testDir = report.config.rootDir
const onDisk = readdirSync(testDir, { recursive: true })
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f.endsWith('.spec.ts'))
  .filter((f) => !f.split('/').some((segment) => segment.startsWith('_')))

const orphans = onDisk.filter((f) => !listed.has(f)).sort()
if (orphans.length > 0) {
  console.error('e2e specs not run by any Playwright project (add them to a testMatch in playwright.config.ts):')
  for (const f of orphans) console.error(`  e2e/${f}`)
  process.exit(1)
}
console.log(`All ${onDisk.length} e2e specs are discovered by a Playwright project.`)
