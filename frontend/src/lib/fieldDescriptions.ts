/**
 * Per-field help text shown by the editor-tab info tooltips (FieldInfo).
 * Keys use the section-prefixed dotted convention from useFieldConfig
 * (component.*, build.*, jira.*, vcs.*, distribution.*, escrow.*) so the same
 * registry can later cover the override editor, filters, and the create
 * dialog. Plain English, generic wording only — no customer/org or
 * product-classification names (CI content validation rejects those).
 * A path with no entry renders no icon.
 *
 * Texts are drafted from the Components Registry docs (functional spec,
 * configuration reference) and the portal's own field semantics; the
 * registry is the single versioned source of truth for field help.
 */
export const fieldDescriptions: Record<string, string> = {
  // ── GeneralTab — component.* ──────────────────────────────────────────────
  'component.name':
    'The unique component key — the canonical identifier used by every API lookup, release automation and legacy v1/v2/v3 clients. Letters, digits, hyphens and underscores. Renaming requires the RENAME_COMPONENTS permission and re-points all old-key lookups to the renamed component.',
  'component.displayName':
    'Human-readable name shown in component lists, search results and reports. Optional free text that falls back to the component key when empty; can be changed at any time without affecting integrations.',
  'component.parentComponentName':
    'The parent component this component belongs to (single-level hierarchy). Only components marked “can be a parent” may be selected, and a can-be-parent component cannot itself have a parent. Leave blank for a top-level component.',
  'component.canBeParent':
    'Allows this component to be selected as another component’s parent. A can-be-parent component cannot itself have a parent (the hierarchy is single-level). Not the same as an aggregator group — see Group Key.',
  'component.groupId':
    'Aggregator-group membership: the key of the registry group this component belongs to (an aggregator owns a components-block in the registry definition). Filled for aggregator members, empty for standalone components. Read-only — set by the migration/import path, never through the portal.',
  'component.solution':
    'Marks the component as a solution rather than a regular component or module. Downstream automation (release notes, distribution display rules) applies solution-specific workflows to flagged components.',
  'component.componentOwner':
    'Username of the person who owns the component and acts as its primary contact. Required. The owner can edit the component and is consulted by release and security workflows.',
  'component.releaseManager':
    'Ordered list of release managers — the first entry is the primary one. Release managers can edit the component and drive its release process. Required when the component is explicitly distributed to external consumers.',
  'component.securityChampion':
    'Ordered list of security champions responsible for the component’s security topics — the first entry is the primary one. Security champions can edit the component. Required when the component is explicitly distributed to external consumers.',
  'component.system':
    'The system this component belongs to. Values come from the admin-managed Systems dictionary. Release automation applies system-specific build, licensing and policy rules based on this classification.',
  'component.clientCode':
    'Code of the customer this component is specific to. Leave empty for generic product components; set it only for customer-specific components so downstream automation can apply customer-specific handling.',
  'component.copyright':
    'Copyright notice for the component, embedded into escrow packages and distributed artifacts for legal compliance. Required when the component is explicitly distributed to external consumers.',
  'component.labels':
    'Classification tags from the admin-managed Labels dictionary. Used for filtering and search, and by special behaviours — for example the “doc” label makes a component selectable as a documentation target in Doc Links.',
  'component.docs':
    'Links from this component to documentation components. Each row points at a component carrying the “doc” label, optionally narrowed to a major version line (e.g. 3.x). Shown as documentation references wherever the component is listed.',
  'component.artifactIds':
    'Group/artifact patterns that identify this component’s artifacts in the artifact repository. Used to resolve an artifact back to its owning component (find-by-artifact). Patterns support wildcards, e.g. my-component-*.',

  // ── JiraTab — jira.* + component.releasesInDefaultBranch ─────────────────
  'jira.projectKey':
    'Key of the issue-tracker project that tracks this component’s releases. Component versions are registered as Fix Versions in this project and release tickets are created there. Can be overridden per version range.',
  'jira.displayName':
    'Human-readable name of the component inside the issue-tracker project. Display-only; useful when several components share one tracker project.',
  'jira.technical':
    'Marks the tracker mapping as technical-only. Technical components are filtered out of customer-facing release notes by the release automation.',
  'component.releasesInDefaultBranch':
    'When enabled, releases are cut directly from the repository’s default branch instead of dedicated release branches. Release automation uses this flag to choose the branching and tagging strategy.',
  'jira.hotfixVersionFormat':
    'Template for hotfix version numbers (e.g. $major.$minor.$service.$fix). Release automation expands the placeholders when registering hotfix releases built from maintenance branches.',
  'jira.versionPrefix':
    'Prefix prepended to this component’s versions in the tracker’s Fix Version field (e.g. a short component name). Keeps versions distinguishable when multiple components share one project.',
  'jira.majorVersionFormat':
    'Template defining how major versions are written in the tracker (e.g. $major.$minor). Used by release automation to format Fix Version names.',
  'jira.releaseVersionFormat':
    'Template for full release version numbers (e.g. $major.$minor.$service). Release automation expands it when registering a release version in the tracker.',
  'jira.buildVersionFormat':
    'Template for build (intermediate) version numbers (e.g. $major.$minor.$service.$fix.$build). CI build numbering uses it for non-release builds.',
  'jira.lineVersionFormat':
    'Template for a version line (e.g. $major.$minor) — identifies a maintenance line rather than a concrete release. Used where automation operates on whole lines.',
  'jira.versionFormat':
    'Generic version format that combines the prefix with the base version templates and defines the canonical shape of this component’s version strings in the tracker.',

  // ── BuildTab — build.* ────────────────────────────────────────────────────
  'build.buildSystem':
    'The build tool that produces this component (e.g. Maven, Gradle, or “provided” for externally built ones). Required: escrow generation and release pipelines select the build wrapper and lifecycle from this value. Can be overridden per version range.',
  'build.buildFilePath':
    'Path to the build file (pom.xml, build.gradle, …) relative to the repository root. Supports dynamic variables such as $version. Build automation uses it to locate the entry point of the build.',
  'build.javaVersion':
    'Java version required to build the component (e.g. 1.8, 11, 17, 21). Build agents and escrow generation provision a matching JDK. Can be overridden per version range.',
  'build.mavenVersion':
    'Maven distribution version used for automated builds of this component when the build system is Maven. Escrow generation downloads and runs exactly this version.',
  'build.gradleVersion':
    'Gradle distribution version used for automated builds of this component when the build system is Gradle. Escrow generation downloads and runs exactly this version.',
  'build.projectVersion':
    'Project version string of the component’s build. Automation that needs version-specific build configuration resolves it from this value.',
  'build.buildTasks':
    'Custom build command(s) to run instead of the default build-tool lifecycle (e.g. clean install or assemble). Supports dynamic variables; used for components with non-standard build sequences.',
  'build.systemProperties':
    'Extra system properties and flags passed to the build (e.g. -Dproperty=value). Supports dynamic variables; used to inject component-specific build configuration.',
  'build.deprecated':
    'Marks this build configuration as obsolete. Downstream tooling warns against — or skips — building the component with a deprecated configuration.',
  'build.requiredProject':
    'Indicates the build requires an additional project to be present. Build automation verifies the prerequisite is available before running the build.',
  'build.requiredTools':
    'External tools that must be available on the build agent (comma-separated). Agent provisioning pre-installs these before building the component.',

  // ── VcsTab — vcs.* ────────────────────────────────────────────────────────
  'vcs.externalRegistry':
    'Reference to an external registry holding this component’s sources when they are not managed in the standard VCS. Set only for externally sourced components.',
  'vcs.entries':
    'Source repositories of the component. Most components have a single entry; multiple entries describe components assembled from several repositories. Rows with an empty VCS Path are dropped on save.',
  'vcs.name':
    'Optional identifier of this repository entry (e.g. main, docs). Useful to tell entries apart when the component has more than one repository.',
  'vcs.vcsPath':
    'Repository location, e.g. an ssh:// Git URL. Required for each entry. Supports dynamic variables; release automation and escrow generation clone the sources from this path.',
  'vcs.repositoryType':
    'Type of the version-control system hosting the repository (e.g. GIT). Read-only — it follows the VCS host and is not user-editable.',
  'vcs.branch':
    'Production branch pattern that releases are built from (e.g. master, or release/$major.$minor; several patterns can be separated by |). Supports dynamic variables and per-version-range overrides.',
  'vcs.tag':
    'Tag format template for release tags (e.g. $version or release/$major.$minor.$service). Release automation creates tags in this format and escrow generation checks sources out by them.',
  'vcs.hotfixBranch':
    'Branch pattern for hotfix releases (e.g. hotfix/$major.$minor). Release automation creates or uses this branch when a hotfix is cut from a maintenance line.',

  // ── DistributionTab — component.distribution* + distribution.* ───────────
  'component.distributionExplicit':
    'Marks the component as having its own distribution rather than being shipped only as part of another component. Together with External it controls distribution eligibility and makes release managers, security champions and copyright mandatory.',
  'component.distributionExternal':
    'Marks the component as delivered to external consumers rather than internal-only. Combined with Explicit it enables external-distribution checks and the requirement for release managers, security champions and copyright.',
  'distribution.mavenArtifacts':
    'Artifact coordinates (group/artifact patterns) this component publishes to the artifact repository. Patterns support dynamic variables. Distribution automation publishes and validates these coordinates on release.',
  'distribution.fileUrlArtifacts':
    'Direct file URLs of pre-built artifacts to publish, optionally with an explicit artifact ID and classifier. Distribution automation fetches the files from these URLs and uploads them under the given coordinates.',
  'distribution.dockerImages':
    'Container images this component distributes (repository/image names, optionally with a flavor). Container-publishing automation pushes and validates these images on release.',
  'distribution.packages':
    'OS package coordinates the component distributes (e.g. rpm or deb packages). Package-publishing automation builds and uploads them on release.',
  'distribution.securityGroups':
    'Access-control groups gating who may download this component’s distributed artifacts. Distribution and escrow automation apply these groups when publishing.',
  'distribution.maven.groupPattern':
    'Maven group pattern of the published artifact (e.g. org.example.alpha). Required — together with the artifact pattern it forms the coordinate that distribution automation publishes and resolves.',
  'distribution.maven.artifactPattern':
    'Maven artifact-id pattern; wildcards allowed (e.g. my-component-*). Required. Matched against the artifacts actually published by the release.',
  'distribution.maven.extension':
    'Artifact packaging/extension (e.g. jar, zip). Optional — leave empty for the repository default.',
  'distribution.maven.classifier':
    'Artifact classifier distinguishing secondary artifacts (e.g. sources, javadoc). Optional.',
  'distribution.fileUrl.url':
    'URL of the pre-built artifact file to distribute. Required for each row; rows with an empty URL are dropped on save.',
  'distribution.fileUrl.artifactId':
    'Artifact ID to publish the file under when it cannot be derived from the URL. Optional.',
  'distribution.fileUrl.classifier':
    'Classifier to publish the file under (e.g. sources). Optional.',
  'distribution.docker.imageName':
    'Container image name including the repository path (e.g. my-org/my-image). Required. The release tag is applied by the publishing automation.',
  'distribution.docker.flavor':
    'Image flavor/variant suffix (e.g. alpine) when the component publishes several variants of the same image. Optional.',
  'distribution.package.type':
    'Package format of the distributed package, e.g. rpm or deb. Required.',
  'distribution.package.name':
    'Name of the distributed OS package. Required.',
  'distribution.securityGroup.type':
    'Access type granted to the group, e.g. read. New rows default to read.',
  'distribution.securityGroup.name':
    'Name of the access-control group that is granted access to the component’s distributed artifacts. Required.',

  // ── EscrowTab — escrow.* + component.productType ──────────────────────────
  'component.productType':
    'Product-line classifier of the component. Values come from field configuration. Escrow and release automation pick product-specific workflows from it — for example whether automatic escrow generation applies.',
  'escrow.generation':
    'Escrow generation mode: AUTO — the escrow tooling builds the package automatically; MANUAL — an escrow configuration is prepared by hand; UNSUPPORTED — no escrow is produced for this component.',
  'escrow.diskSpace':
    'Disk space the escrow build requires (e.g. 10GB). Build-agent provisioning reserves at least this much space before running escrow generation.',
  'escrow.reusable':
    'Allows dependent components to reuse this component’s already-built escrow package instead of rebuilding it — a build-time optimization for shared dependencies.',
  'escrow.providedDependencies':
    'Dependencies treated as provided in the escrow package: they are referenced but not bundled. Comma-separated coordinates; escrow generation excludes them from packaging.',
  'escrow.additionalSources':
    'Extra source paths (relative to the repository root) to include in the escrow package beyond the standard layout — for example auxiliary folders the build needs.',
  'escrow.gradleIncludeConfigurations':
    'Gradle configurations whose dependencies are included in the escrow package (comma-separated, e.g. compile,runtimeClasspath).',
  'escrow.gradleExcludeConfigurations':
    'Gradle configurations excluded from escrow dependency resolution (comma-separated, e.g. testCompile,testRuntime).',
  'escrow.gradleIncludeTestConfigurations':
    'Includes Gradle test configurations (the test classpath dependencies) in the escrow package. Off by default.',
  'escrow.buildTask':
    'Custom build task the escrow generation runs instead of the default build lifecycle. Supports dynamic variables; set it for components that need a non-standard escrow build sequence. Configurable as a per-version override.',
}
