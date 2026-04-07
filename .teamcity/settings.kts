import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.vcs.GitVcsRoot
import _Self.buildTypes.*

version = "2025.03"

project {
    id("OctopusComponentsManagementPortal")
    name = "Octopus Components Management Portal"

    vcsRoot(OctopusComponentsManagementPortalVcs)

    params {
        param("COMPONENT_NAME", "components-management-portal")
        param("OCTOPUS_MODULE_NAME", "octopus-components-management-portal")
        param("OKD_IMAGE_NAME", "components-management-portal")
        param("LAST_RELEASE_VERSION", "0.0.1")
        param("PROJECT_VERSION", "")
    }

    buildType(id10CompileUtAuto)
    buildType(id20DeployToOkdQaManual)
    buildType(id40ReleaseManual)
    buildType(id50ReleasePostProcessingAuto)
    buildType(id50DeployToOkdQaAuto)
    buildType(id70DeployToOkdProdManual)
    buildType(WLValidation)

    buildTypesOrder = arrayListOf(
        id10CompileUtAuto,
        id20DeployToOkdQaManual,
        id40ReleaseManual,
        id50ReleasePostProcessingAuto,
        id50DeployToOkdQaAuto,
        id70DeployToOkdProdManual,
        WLValidation
    )
}

object OctopusComponentsManagementPortalVcs : GitVcsRoot({
    id("OctopusComponentsManagementPortalVcs")
    name = "octopus-components-management-portal"
    url = "https://github.com/octopusden/octopus-components-management-portal.git"
    branch = "refs/heads/main"
    branchSpec = "+:refs/heads/*"
    authMethod = password {
        userName = "%github.user%"
        password = "%github.token%"
    }
})
