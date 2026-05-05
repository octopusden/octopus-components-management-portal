import { Layout } from '../components/Layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { FieldConfigEditor } from '../components/admin/FieldConfigEditor'
import { ComponentDefaultsForm } from '../components/admin/ComponentDefaultsForm'
import { MigrationHistoryPanel } from '../components/admin/MigrationHistoryPanel'
import { MigrationPanel } from '../components/admin/MigrationPanel'
import { TeamCityResyncPanel } from '../components/admin/TeamCityResyncPanel'

export function AdminSettingsPage() {
  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Settings</h1>
        </div>

        <Tabs defaultValue="field-config" variant="underline">
          <TabsList>
            <TabsTrigger value="field-config">Field Configuration</TabsTrigger>
            <TabsTrigger value="component-defaults">Component Defaults</TabsTrigger>
            <TabsTrigger value="migration">Migration</TabsTrigger>
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
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Components</h2>
                <p className="text-sm text-muted-foreground">
                  Migrate Groovy DSL components into the database. Defaults are rewritten in
                  the same step. Enable Admin mode in the footer to arm the Run button.
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
                  components. Enable Admin mode in the footer to arm the button.
                </p>
                <div className="pt-2">
                  <TeamCityResyncPanel />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}
