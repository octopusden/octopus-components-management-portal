import { Layout } from '../components/Layout'

/**
 * Registry Health — admin-only diagnostics surface. Stub for now (Phase 6 fills
 * in the aggregated health checks); the route exists so the Health nav entry
 * does not 404.
 */
export function RegistryHealthPage() {
  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Registry Health</h1>
        <p className="text-muted-foreground">Coming soon.</p>
      </div>
    </Layout>
  )
}
