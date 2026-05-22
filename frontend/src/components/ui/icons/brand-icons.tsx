// Brand-specific SVG icons used in the components-list Links column to
// match the §7.0.6 mockup. The mockup HTML lives in the sister CRS repo:
// `octopus-components-registry-service/docs/registry/prototypes/index.html`.
// lucide-react has no Atlassian/JetBrains-branded equivalents, so the SVG
// paths are inlined here. Brand colors (Atlassian blue, JetBrains cyan)
// are trademarked vendor colors and stay constant across themes — they
// are not a design-system token. The interactive affordance comes from
// the surrounding link's `hover:opacity-80`, mirroring the prototype.
//
// `data-testid="brand-icon-<name>"` lets DOM-level tests pin which icon
// the Links cell renders without coupling to fill values or path data.

interface BrandIconProps {
  className?: string
}

const ATLASSIAN_BLUE = '#2684FF'
const JETBRAINS_CYAN = '#07C3F2'

export function JiraIcon({ className }: BrandIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={ATLASSIAN_BLUE}
      aria-hidden="true"
      data-testid="brand-icon-jira"
    >
      <path d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 005.215 5.214h2.129v2.058a5.218 5.218 0 005.215 5.214V6.758a1.001 1.001 0 00-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024 12.483V1.005A1.001 1.001 0 0023.013 0z" />
    </svg>
  )
}

export function BitbucketIcon({ className }: BrandIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={ATLASSIAN_BLUE}
      aria-hidden="true"
      data-testid="brand-icon-bitbucket"
    >
      <path d="M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891z" />
      <path d="M14.52 15.53H9.522L8.17 8.466h7.561z" fill="#FFFFFF" />
    </svg>
  )
}

export function TeamCityIcon({ className }: BrandIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={JETBRAINS_CYAN}
      aria-hidden="true"
      data-testid="brand-icon-teamcity"
    >
      <path d="M0 0v24h24V0zm2.664 2.964h7.48v1.832H7.396v7.196H5.412V4.796H2.664zm9.328 18H2.992v-1.5h8.999zm5.564-9.218a4.62 4.62 0 01-2.036.374 4.556 4.556 0 01-4.628-4.616v-.024a4.584 4.584 0 014.708-4.668 4.656 4.656 0 013.56 1.388l-1.264 1.456a3.336 3.336 0 00-2.312-1.02 2.671 2.671 0 00-2.616 2.8v.028a2.68 2.68 0 002.616 2.836 3.226 3.226 0 002.376-1.056l1.264 1.276a4.619 4.619 0 01-1.668 1.226z" />
    </svg>
  )
}
