// Tooltip shown on a disabled Save / field-override control when the current user
// is not the component's owner / release manager / security champion / the owner's
// manager (and not an admin). Mirrors the backend `canEditComponent` gate, surfaced
// to the SPA via `ComponentDetail.canEdit`.
export const CANNOT_EDIT_TITLE =
  "Only the component owner, a release manager, a security champion, the owner's manager, or an administrator can edit this component"
