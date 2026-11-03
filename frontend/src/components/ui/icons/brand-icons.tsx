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

export function GiteaIcon({ className }: BrandIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="#609926"
      aria-hidden="true"
      data-testid="brand-icon-gitea"
    >
      <path d="M4.209 4.603c-.247 0-.525.02-.84.088-.333.07-1.28.283-2.054 1.027C-.403 7.25.035 9.685.089 10.052c.065.446.263 1.687 1.21 2.768 1.749 2.141 5.513 2.092 5.513 2.092s.462 1.103 1.168 2.119c.955 1.263 1.936 2.248 2.89 2.367 2.406 0 7.212-.004 7.212-.004s.458.004 1.08-.394c.535-.324 1.013-.893 1.013-.893s.492-.527 1.18-1.73c.21-.37.385-.729.538-1.068 0 0 2.107-4.471 2.107-8.823-.042-1.318-.367-1.55-.443-1.627-.156-.156-.366-.153-.366-.153s-4.475.252-6.792.306c-.508.011-1.012.023-1.512.027v4.474l-.634-.301c0-1.39-.004-4.17-.004-4.17-1.107.016-3.405-.084-3.405-.084s-5.399-.27-5.987-.324c-.187-.011-.401-.032-.648-.032zm.354 1.832h.111s.271 2.269.6 3.597C5.549 11.147 6.22 13 6.22 13s-.996-.119-1.641-.348c-.99-.324-1.409-.714-1.409-.714s-.73-.511-1.096-1.52C1.444 8.73 2.021 7.7 2.021 7.7s.32-.859 1.47-1.145c.395-.106.863-.12 1.072-.12zm8.33 2.554c.26.003.509.127.509.127l.868.422-.529 1.075a.686.686 0 0 0-.614.359.685.685 0 0 0 .072.756l-.939 1.924a.69.69 0 0 0-.66.527.687.687 0 0 0 .347.763.686.686 0 0 0 .867-.206.688.688 0 0 0-.069-.882l.916-1.874a.667.667 0 0 0 .237-.02.657.657 0 0 0 .271-.137 8.826 8.826 0 0 1 1.016.512.761.761 0 0 1 .286.282c.073.21-.073.569-.073.569-.087.29-.702 1.55-.702 1.55a.692.692 0 0 0-.676.477.681.681 0 1 0 1.157-.252c.073-.141.141-.282.214-.431.19-.397.515-1.16.515-1.16.035-.066.218-.394.103-.814-.095-.435-.48-.638-.48-.638-.467-.301-1.116-.58-1.116-.58s0-.156-.042-.27a.688.688 0 0 0-.148-.241l.516-1.062 2.89 1.401s.48.218.583.619c.073.282-.019.534-.069.657-.24.587-2.1 4.317-2.1 4.317s-.232.554-.748.588a1.065 1.065 0 0 1-.393-.045l-.202-.08-4.31-2.1s-.417-.218-.49-.596c-.083-.31.104-.691.104-.691l2.073-4.272s.183-.37.466-.497a.855.855 0 0 1 .35-.077z" />
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
