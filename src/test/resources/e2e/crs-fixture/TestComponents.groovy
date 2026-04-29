// Single component is enough for the portal smoke spec — `count > 0` and
// `data.content[0].id` are the only assertions that touch CRS.
import static org.octopusden.octopus.escrow.BuildSystem.*

Defaults {
    system = "NONE"
    tag = '$module-$version'
    releasesInDefaultBranch = true
    solution = false
}

"e2e-component" {
    componentOwner = "e2e-admin"
    "$ALL_VERSIONS" {
        groupId = "org.octopusden.octopus.test"
        artifactId = "e2e-component"
        jira {
            projectKey = "E2E"
            majorVersionFormat = '$major.$minor'
            releaseVersionFormat = '$major.$minor.$service'
            displayName = "E2E TEST COMPONENT"
        }
    }
}
