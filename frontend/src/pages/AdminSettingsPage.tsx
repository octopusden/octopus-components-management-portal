import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { StatusBanner } from '../components/ui/status-banner'
import { FieldConfigEditor } from '../components/admin/FieldConfigEditor'
import { ComponentDefaultsForm } from '../components/admin/ComponentDefaultsForm'
import { MigrationHistoryPanel } from '../components/admin/MigrationHistoryPanel'
import { MigrationPanel } from '../components/admin/MigrationPanel'
import { TeamCityResyncPanel } from '../components/admin/TeamCityResyncPanel'
import { ServiceEventsPanel } from '../components/admin/ServiceEventsPanel'
import { FeedbackPanel } from '../components/admin/FeedbackPanel'
import { AdminModeArmBar } from '../components/admin/AdminModeArmBar'
import { RuntimeSection } from '../components/RuntimeSection'
import { useReloadConfig } from '../hooks/useAdminConfig'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAdminMode } from '../lib/adminModeStore'
import { hasPermission, PERMISSIONS } from '../lib/auth'

function ConfigReloadBar() {
  const adminMode = useAdminMode((s) => s.enabled)
  const { mutate, reset, isPending, isSuccess, error } = useReloadConfig()

  // The success flag is sticky on a mutation result; auto-clear the "Reloaded"
  // hint after a couple of seconds (mirrors the old editors' saved-feedback UX).
  useEffect(() => {
    if (!isSuccess) return
    const t = setTimeout(() => reset(), 2000)
    return () => clearTimeout(t)
  }, [isSuccess, reset])

  return (
    <StatusBanner variant="info" className="flex items-center justify-between gap-4">
      <span className="text-sm">
        Field configuration and component defaults are <strong>managed as code</strong> in
        service-config and shown read-only here. Edit them in service-config, then reload to
        apply without a redeploy.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {isSuccess && <span className="text-xs text-muted-foreground">Reloaded</span>}
        {error && (
          <span className="text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutate()}
          disabled={!adminMode || isPending}
          title={adminMode ? 'Reload config from service-config' : 'Arm Admin mode on the Migration tab to reload'}
        >
          <RefreshCw className="h-4 w-4" />
          {isPending ? 'Reloading…' : 'Reload'}
        </Button>
      </div>
    </StatusBanner>
  )
}

export function AdminSettingsPage() {
  const { data: user } = useCurrentUser()
  const adminMode = useAdminMode((s) => s.enabled)
  // The System tab surfaces operational/runtime data (JVM, recent logins). It is
  // admin/DevOps-only: gate on the same condition as the ADMIN badge — admin mode
  // ON and the real IMPORT_DATA permission. Hidden entirely otherwise (not a
  // disabled tab), and RuntimeSection passes the same gate into its polling hook.
  const showSystem = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
        </div>

        <ConfigReloadBar />

        <Tabs defaultValue="field-config" variant="underline">
          <TabsList>
            <TabsTrigger value="field-config">Field Configuration</TabsTrigger>
            <TabsTrigger value="component-defaults">Component Defaults</TabsTrigger>
            <TabsTrigger value="migration">Migration</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            {showSystem && <TabsTrigger value="system">System</TabsTrigger>}
          </TabsList>

          <TabsContent value="field-config" className="mt-4">
            <div className="rounded-lg border p-6 space-y-2">
              <h2 className="text-lg font-semibold">Field Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Controls which fields are editable, readonly, or hidden across the registry.
              </p>
              <div className="pt-2">
                <FieldConfigEditor />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="component-defaults" className="mt-4">
            <div className="rounded-lg border p-6 space-y-2">
              <h2 className="text-lg font-semibold">Component Defaults</h2>
              <p className="text-sm text-muted-foreground">
                Default values applied to new components when fields are not explicitly set.
              </p>
              <div className="pt-2">
                <ComponentDefaultsForm />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="migration" className="mt-4">
            <div className="rounded-lg border p-6 space-y-6">
              <AdminModeArmBar />

              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Components</h2>
                <p className="text-sm text-muted-foreground">
                  Migrate Groovy DSL components into the database. Defaults are rewritten in
                  the same step. Arm Admin mode above to enable the Run button.
                </p>
                <div className="pt-2">
                  <MigrationPanel />
                </div>
              </div>

              <div className="border-t pt-6 space-y-2">
                <h2 className="text-lg font-semibold">History</h2>
                <p className="text-sm text-muted-foreground">
                  Backfill component-history into audit_log from the git tag chain. Runs
                  separately from the components migration; only one of the two can run at a
                  time.
                </p>
                <div className="pt-2">
                  <MigrationHistoryPanel />
                </div>
              </div>

              <div className="border-t pt-6 space-y-2">
                <h2 className="text-lg font-semibold">TeamCity</h2>
                <p className="text-sm text-muted-foreground">
                  Resync persisted teamcityProjectId + teamcityProjectUrl from
                  TC project params. Overwrites manual overrides for matched
                  components. Arm Admin mode above to enable the button.
                </p>
                <div className="pt-2">
                  <TeamCityResyncPanel />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <div className="rounded-lg border p-6 space-y-2">
              <h2 className="text-lg font-semibold">Service Events</h2>
              <p className="text-sm text-muted-foreground">
                Operational history across both services — redeploys, data migrations,
                TeamCity resync, and the scheduled component-validation sweep. Read-only.
              </p>
              <div className="pt-2">
                <ServiceEventsPanel />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="feedback" className="mt-4">
            <div className="rounded-lg border p-6 space-y-2">
              <h2 className="text-lg font-semibold">Feedback</h2>
              <p className="text-sm text-muted-foreground">
                Problem reports, ideas, and questions submitted by users. Filter, read details and
                screenshots, and advance the status.
              </p>
              <div className="pt-2">
                <FeedbackPanel />
              </div>
            </div>
          </TabsContent>

          {showSystem && (
            <TabsContent value="system" className="mt-4">
              <RuntimeSection />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  )
}
