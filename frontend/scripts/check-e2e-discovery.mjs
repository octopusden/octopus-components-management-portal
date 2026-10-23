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

const res = spawnSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
// No report at all (npx missing, config throws): say why. Unparseable stdout
// throws, which also exits 1. Load errors (e.g. test.only under forbidOnly)
// come back as JSON errors with a non-zero exit.
if (res.error || !res.stdout) {
  console.error(res.error ?? res.stderr)
  process.exit(1)
}
const report = JSON.parse(res.stdout)
if (res.status !== 0 || report.errors.length) {
  console.error(res.stderr, ...report.errors.map((e) => e.message))
  process.exit(1)
}

const listed = new Set(report.suites.map((s) => s.file))
const onDisk = readdirSync(report.config.rootDir, { recursive: true }).filter(
  (f) => /\.spec\.ts$/.test(f) && !/(^|\/)_/.test(f),
)

const orphans = onDisk.filter((f) => !listed.has(f)).sort()
if (orphans.length > 0) {
  console.error('e2e specs not run by any Playwright project (add them to a testMatch in playwright.config.ts):')
  for (const f of orphans) console.error(`  e2e/${f}`)
  process.exit(1)
}
console.log(`All ${onDisk.length} e2e specs are discovered by a Playwright project.`)
