# Templates tab

Admin settings → **Templates**, behind the page's `IMPORT_DATA` gate. Read-only: profiles and
templates are configuration in service-config (`components-registry.component-profiles`), changed by
a reviewed change there and a registry config reload.

- **List** (`GET /rest/api/4/admin/component-profiles`, read each time the tab opens): every entry,
  live or failed, with id, kind ("unknown" when the registry could not read it) and status, and for
  a live entry its title and version. A failed entry shows each problem and the configuration text
  the registry read.
- **Last load**: applied or failed, with its problems and the configuration version. After a failed
  reload the list is the configuration still in use.
- **Details** of a live template: parameters with their settings, classification, overridable
  fields, and the configuration text with a copy button. The registry exposes which field each
  value goes into only inside that text; Try it shows it per field.
- **Try it**: the same parameter form and checks as the wizard, then one dry run; the result shows
  every rendered field with the parameters it came from, and every problem, the Portal-only create
  rules included. Nothing is created and nothing can be edited.
