package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

object id70DeployToOkdProdManual : BuildType({
    templates(AbsoluteId("RnDProcessesAutomation_IdpComponentOkdDeploy"))
    id("70DeployToOkdProdManual")
    name = "[6.0] Deploy to OKD PROD [MANUAL]"

    params {
        param("TEAMCITY_UPDATE_PROJECT_IDS", "RDDepartment")
        param("TEAMCITY_UPDATE_BUILD_CONFIGURATION_IDS", "")
        text("OKD_SERVER_URL", "%OKD_SERVER_PROD_URL%", allowEmpty = false)
        param("GRADLE_EXTRA_PARAMETERS", "-Pversion=%BUILD_NUMBER% -PTEAMCITY_URL=%TEAMCITY_URL% -PTEAMCITY_USER=%TEAMCITY_REST_USER% -PTEAMCITY_PASSWORD=%TEAMCITY_REST_API_USER_PASSWORD% -PTEAMCITY_PROJECT=%RELEASE_MANAGEMENT_ROOT_PROJECT_ID%")
        param("TEAMCITY_UPDATE_PARAMETER_NAME", "COMPONENTS_MANAGEMENT_PORTAL_VERSION")
        param("BUILD_NUMBER", "${id50DeployToOkdQaAuto.depParamRefs.buildNumber}")
        param("DEPLOYMENT_ENVIRONMENT", "production")
        param("HELM_EXTRA_SERVICES_SET", "--set image.name=octopusden/%OKD_IMAGE_NAME% --set replicas=1")
        param("TEAMCITY_UPDATE_PARAMETER_VALUE", "%BUILD_NUMBER%")
        text("OKD_SA_TOKEN", "%OKD_SA_PROD_TOKEN%", display = ParameterDisplay.HIDDEN, allowEmpty = true)
    }

    steps {
        step {
            name = "Clone sources"
            id = "RUNNER_966"
            type = "CloneGitRepository"
            enabled = false
            executionMode = BuildStep.ExecutionMode.DEFAULT
            param("BRANCH", "v%BUILD_NUMBER%")
            param("REUSE", "false")
            param("teamcity.step.phase", "")
            param("DIRECTORY", "octopus-%COMPONENT_NAME%")
            param("REPOSITORY_URL", "https://github.com/octopusden/octopus-%OKD_IMAGE_NAME%.git")
        }
        step {
            name = "Upload TeamCity Metarunners"
            id = "Upload_TeamCity_Metarunners"
            type = "UploadTeamCityProjectMetarunners"
            enabled = false
            executionMode = BuildStep.ExecutionMode.DEFAULT
            param("plugin.docker.imagePlatform", "")
            param("TEAMCITY_METARUNNERS_ZIP_URL", "https://repo1.maven.org/maven2/org/octopusden/octopus/components/portal/%BUILD_NUMBER%/components-management-portal-%BUILD_NUMBER%-metarunners.zip")
            param("plugin.docker.imageId", "")
            param("teamcity.step.phase", "")
            param("TEAMCITY_PROJECT_ID", "%RELEASE_MANAGEMENT_ROOT_PROJECT_ID%")
            param("plugin.docker.run.parameters", "")
        }
        step {
            name = "Update Components Management Portal Version Parameter"
            id = "Update_Components_Management_Portal_Version_Parameter"
            type = "UpdateTeamCityProjectsAndBuildConfigurationsParameter"
            enabled = false
            executionMode = BuildStep.ExecutionMode.DEFAULT
            param("TEAMCITY_UPDATE_BUILD_CONFIGURATION_IDS", "%TEAMCITY_UPDATE_BUILD_CONFIGURATION_IDS%")
            param("TEAMCITY_UPDATE_PROJECT_IDS", "%TEAMCITY_UPDATE_PROJECT_IDS%")
            param("TEAMCITY_UPDATE_PARAMETER_NAME", "%TEAMCITY_UPDATE_PARAMETER_NAME%")
            param("plugin.docker.imagePlatform", "")
            param("plugin.docker.imageId", "")
            param("teamcity.step.phase", "")
            param("TEAMCITY_UPDATE_PARAMETER_VALUE", "%TEAMCITY_UPDATE_PARAMETER_VALUE%")
            param("plugin.docker.run.parameters", "")
        }
    }

    dependencies {
        snapshot(id50DeployToOkdQaAuto) {
        }
    }
})
