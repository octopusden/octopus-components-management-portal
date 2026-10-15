import { test, expect } from '@playwright/test'
import componentProfilesFixture from '../src/test-fixtures/component-profiles.contract.json' with { type: 'json' }
import {
  mockComponentDefaults,
  mockComponentList,
  mockComponentProfiles,
  mockComponentTemplate,
  mockFieldConfig,
  mockLabels,
  mockOwners,
} from './visual/_helpers'

// ---------------------------------------------------------------------------
// Create a component from a template — route-mocked, chromium-admin.
//
// Picks the template tile, fills its parameters, and checks that Next sends one dry run, Review
// shows the rendered component, and Create sends the values with the Jira task key. Every
// registry call is intercepted, so the spec does not depend on a template in the stand's
// service-config.
// ---------------------------------------------------------------------------

const VCS_PATH = 'baseConfiguration.vcsEntries[0].vcsPath'
const CREATED_ID = '44444444-4444-4444-4444-444444444444'

const TEMPLATE_ENTRY = {
  id: 'client-plugin',
  kind: 'template',
  version: 3,
  title: 'Client plugin',
  description: 'A plugin built for one client',
  classification: { external: true, explicit: 'false', solution: false },
  rules: [],
  usable: true,
}

const TEMPLATE = {
  id: 'client-plugin',
  version: 3,
  title: 'Client plugin',
  description: 'A plugin built for one client',
  classification: { external: true, explicit: 'false', solution: false },
  overridable: [VCS_PATH],
  parameters: [
    { name: 'CLIENT_CODE', label: 'Client code', type: 'select', required: true, multiple: false, default: ['ABC'], options: ['ABC', 'XYZ'] },
    {
      name: 'PLUGIN_CODE',
      label: 'Plugin code',
      type: 'text',
      required: true,
      multiple: false,
      default: [],
      pattern: '^[A-Z][A-Z0-9]{2,15}$',
      message: '3–16 uppercase letters or digits, starting with a letter.',
    },
  ],
}

const RENDERED = {
  name: 'abc-plugin-pay',
  componentOwner: 'owner-oscar',
  distributionExternal: true,
  distributionExplicit: false,
  baseConfiguration: {
    build: { buildSystem: 'GRADLE' },
    vcsEntries: [{ vcsPath: 'ssh://git@git.example.com/abc/plugin.git', branch: 'master', tag: 'v$version' }],
    jira: { projectKey: 'ABC', versionFormat: '$versionPrefix-$baseVersionFormat' },
  },
}

test.describe('Create component from a template — admin smoke', () => {
  test('template tile → parameters → one dry run → review → create', async ({ page }) => {
    const runs: Array<{ body: Record<string, unknown>; dryRun: boolean }> = []
    await mockComponentList(page, { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true })
    await mockFieldConfig(page, {})
    await mockComponentDefaults(page)
    await mockComponentProfiles(page, { profiles: [...componentProfilesFixture.profiles, TEMPLATE_ENTRY] })
    await mockOwners(page, ['owner-oscar'])
    await mockLabels(page, ['backend'])
    await page.route('**/portal/links', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gitBaseUrl: 'ssh://git@git.example.com' }) }),
    )
    await mockComponentTemplate(page, TEMPLATE, (body, dryRun) => {
      runs.push({ body, dryRun })
      return dryRun
        ? { status: 200, body: { valid: true, parameterProblems: [], problems: [], component: RENDERED, sources: { name: ['CLIENT_CODE', 'PLUGIN_CODE'] }, overridden: [] } }
        : { status: 201, body: { ...RENDERED, id: CREATED_ID, configurations: [], teamcityProjects: [], artifactIds: [] } }
    })

    await page.goto('/components/new')
    const tile = page.getByRole('radio', { name: 'Client plugin' })
    await expect(tile.getByText('Template')).toBeVisible()
    await tile.click()

    const code = page.getByTestId('template-parameter-PLUGIN_CODE').getByRole('textbox')
    await code.fill('pay')
    await expect(page.getByText('3–16 uppercase letters or digits, starting with a letter.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled()
    await code.fill('PAY')
    expect(runs).toHaveLength(0)
    await page.getByRole('button', { name: /^next$/i }).click()

    await expect(page.getByTestId('review-field-name')).toContainText('abc-plugin-pay')
    expect(runs).toEqual([{ dryRun: true, body: { parameters: { CLIENT_CODE: ['ABC'], PLUGIN_CODE: ['PAY'] }, overrides: {} } }])

    await page.getByLabel(/jira task key/i).fill('CD-1234')
    await page.getByRole('button', { name: /create component/i }).click()
    await expect(page.getByRole('heading', { name: 'Component created' })).toBeVisible()
    expect(runs[1]).toEqual({
      dryRun: false,
      body: { parameters: { CLIENT_CODE: ['ABC'], PLUGIN_CODE: ['PAY'] }, overrides: {}, jiraTaskKey: 'CD-1234' },
    })
  })
})
