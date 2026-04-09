import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.buildFeatures.XmlReport
import jetbrains.buildServer.configs.kotlin.buildFeatures.xmlReport
import jetbrains.buildServer.configs.kotlin.triggers.finishBuildTrigger
import jetbrains.buildServer.configs.kotlin.vcs.GitVcsRoot

version = "2025.03"

project {
    vcsRoot(OctopusComponentsManagementPortalVcs)

    params {
        param("COMPONENT_NAME", "components-management-portal")
        param("OCTOPUS_MODULE_NAME", "octopus-components-management-portal")
        param("OKD_IMAGE_NAME", "components-management-portal")
        param("LAST_RELEASE_VERSION", "0.0.1")
        param("PROJECT_VERSION", "0.0.1")
        // Proxies nodejs.org/dist via Artifactory. Adjust repo name if needed.
        param("node.dist.base.url", "%ARTIFACTORY_URL%/artifactory/nodejs-remote")
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

object id10CompileUtAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusGradleBuild"))
    id("10CompileUtAuto")
    name = "[1.0] Compile & UT [AUTO]"

    params {
        param("env.JAVA_HOME", "%env.JDK_ZULU_21_x64%")
        // node.dist.base.url must be set in TC project parameters (not in source).
        // npm-virtual is the standard Artifactory virtual npm registry endpoint.
        param("GRADLE_EXTRA_PARAMETERS", "-Pnode.dist.base.url=%node.dist.base.url%")
        param("env.NPM_CONFIG_REGISTRY", "%ARTIFACTORY_URL%/artifactory/api/npm/npm-virtual/")
        param("ARTIFACT_PATH", """
            build/reports/tests/** => reports/kotlin-tests
            build/reports/jacoco/** => reports/kotlin-coverage
            frontend/build/reports/coverage/** => reports/frontend-coverage
            frontend/build/test-results/** => test-results/frontend
        """.trimIndent())
        param("GRADLE_TASK", "clean build publishToMavenLocal dockerPushImage -info")
    }

    features {
        // Gradle runner auto-discovers build/test-results/ for Kotlin tests.
        // Frontend JUnit XML lands in frontend/build/test-results/ — needs explicit processing.
        xmlReport {
            reportType = XmlReport.XmlReportType.JUNIT
            rules = "+:frontend/build/test-results/**/*.xml"
        }
    }

    requirements {
        doesNotContain("teamcity.agent.jvm.os.name", "Windows", "RQ_2816")
    }
})

object id20DeployToOkdQaManual : BuildType({
    templates(AbsoluteId("RnDProcessesAutomation_IdpComponentOkdDeploy"))
    id("20DeployToOkdQaManual")
    name = "[2.0] Deploy to OKD QA [MANUAL]"

    params {
        text("OKD_SERVER_URL", "%OKD_SERVER_DEV_URL%", allowEmpty = false)
        param("BUILD_NUMBER", "${id10CompileUtAuto.depParamRefs.buildNumber}")
        text("OKD_APPS_DOMAIN", "%OKD_APPS_DOMAIN_DEV%", allowEmpty = false)
    }

    dependencies {
        snapshot(id10CompileUtAuto) {
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }

    disableSettings("BUILD_EXT_1740")
})

object id40ReleaseManual : BuildType({
    templates(AbsoluteId("Octopus_OctopusComponents_OctopusRelease"))
    id("40ReleaseManual")
    name = "[3.0] Release [MANUAL]"

    params {
        param("PROJECT_VERSION", "${id10CompileUtAuto.depParamRefs["PROJECT_VERSION"]}")
        param("CURRENT_COMMIT", "${id10CompileUtAuto.depParamRefs["CURRENT_COMMIT"]}")
        param("BUILD_NUMBER", "${id10CompileUtAuto.depParamRefs.buildNumber}")
    }

    dependencies {
        snapshot(id20DeployToOkdQaManual) {
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }
})

object id50ReleasePostProcessingAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusComponents_HOctopusTest_OctopusReleasePostProcessing"))
    id("50ReleasePostProcessingAuto")
    name = "[4.0] Release Post Processing [AUTO]"

    params {
        param("LAST_RELEASE_VERSION", "%LAST_RELEASE_VERSION%")
    }
})

object id50DeployToOkdQaAuto : BuildType({
    templates(AbsoluteId("RnDProcessesAutomation_IdpComponentOkdDeploy"))
    id("50DeployToOkdQaAuto")
    name = "[5.0] Deploy to OKD QA [AUTO]"

    params {
        text("OKD_SERVER_URL", "%OKD_SERVER_DEV_URL%", allowEmpty = false)
        param("BUILD_NUMBER", "${id50ReleasePostProcessingAuto.depParamRefs.buildNumber}")
        text("OKD_APPS_DOMAIN", "%OKD_APPS_DOMAIN_DEV%", allowEmpty = false)
    }

    triggers {
        finishBuildTrigger {
            id = "TRIGGER_1596"
            buildType = "${id50ReleasePostProcessingAuto.id}"
            successfulOnly = true
        }
    }

    dependencies {
        snapshot(id50ReleasePostProcessingAuto) {
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }

    // Disables the VCS labeling feature (BUILD_EXT_1740) defined in the RnDProcessesAutomation_IdpComponentOkdDeploy template — not needed for QA deployments
    disableSettings("BUILD_EXT_1740")
})

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
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }
})

object WLValidation : BuildType({
    templates(AbsoluteId("OctopusWlValidator"))
    id("WLValidation")
    name = "WL Validation"
})
