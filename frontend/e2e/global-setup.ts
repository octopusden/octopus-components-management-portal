import { authenticateRole } from './auth.setup'

// Runs once before any project. We sign in both roles (admin + viewer) and
// persist their storageState to disk; per-role projects then load the file
// they need via `use.storageState`. The anon project doesn't need anything
// here — it explicitly omits storageState in playwright.config.ts.
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:18090'

  const adminUsername = required('E2E_ADMIN_USERNAME')
  const adminPassword = required('E2E_ADMIN_PASSWORD')
  const viewerUsername = required('E2E_VIEWER_USERNAME')
  const viewerPassword = required('E2E_VIEWER_PASSWORD')

  await authenticateRole(baseURL, {
    username: adminUsername,
    password: adminPassword,
    storageStatePath: 'playwright/.auth/admin.json',
  })
  await authenticateRole(baseURL, {
    username: viewerUsername,
    password: viewerPassword,
    storageStatePath: 'playwright/.auth/viewer.json',
  })
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Required env var ${name} is not set. See frontend/e2e/README.md for the contract.`,
    )
  }
  return value
}
