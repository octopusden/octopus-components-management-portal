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
        // Base URL for Vite build — set to sub-path (e.g. /components-management-portal/)
        // when serving via API gateway prefix, or "/" when serving from a dedicated domain.
        param("env.VITE_APP_BASE_URL", "/")
    }

    buildType(id10CompileUtAuto)
    buildType(id15E2eAuto)
    buildType(id20DeployToOkdQaManual)
    buildType(id40ReleaseManual)
    buildType(id50ReleasePostProcessingAuto)
    buildType(id50DeployToOkdQaAuto)
    buildType(id70DeployToOkdProdManual)
    buildType(id25DeployToOkdProdManualTemp)
    buildType(WLValidation)

    buildTypesOrder = arrayListOf(
        id10CompileUtAuto,
        id15E2eAuto,
        id20DeployToOkdQaManual,
        id25DeployToOkdProdManualTemp,
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

// E2E build runs after id10CompileUtAuto — chained snapshot dependency.
// Spins up Postgres, Keycloak, CRS, the portal, and Playwright as
// containers on a shared docker network. No host-side prerequisites
// beyond Docker — agents stay universal.
//
// Agent prerequisites:
//   - Docker daemon (any modern version).
//   - Network access to the Dev Artifactory used to pull the CRS image.
//
// Why chained, not parallel: the bootJar produced by id10CompileUtAuto
// is the same artifact the portal container runs, so building it once
// and consuming it here keeps the e2e run honest about what was
// actually compiled. A failing Compile&UT also makes the e2e run moot,
// so failing fast saves agent minutes.
object id15E2eAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusGradleBuild"))
    id("15E2eAuto")
    name = "[1.5] E2E [AUTO]"

    // Inherit the displayed build number from Compile&UT — without this
    // TC shows an autoincrementing 0.0.1-N counter that doesn't line up
    // with the upstream build, making it harder to correlate an e2e fail
    // with the artefact it tested. `param("BUILD_NUMBER", ...)` only
    // sets a custom param (that's id20DeployToOkdQaManual's pattern,
    // consumed by the deploy template); to change the visible build
    // number we need buildNumberPattern.
    buildNumberPattern = "${id10CompileUtAuto.depParamRefs.buildNumber}"

    params {
        param("env.JAVA_HOME", "%env.JDK_ZULU_21_x64%")
        param("ARTIFACT_PATH", """
            build/reports/tests/e2eTest/** => reports/e2e
            build/test-results/e2eTest/** => test-results/e2e
            frontend/playwright-report/** => reports/playwright
            frontend/test-results/** => test-results/playwright
        """.trimIndent())
        // No clean — the daemon cache speeds up warm runs and the test
        // task itself sets outputs.upToDateWhen { false } so nothing
        // legitimately rots from skipping clean.
        param("GRADLE_TASK", "e2eTest -info")
        // Mirror id20's BUILD_NUMBER param too — the gradle template
        // reads it for tagging artefacts and for the build/version
        // gradle property.
        param("BUILD_NUMBER", "${id10CompileUtAuto.depParamRefs.buildNumber}")
    }

    features {
        // The Kotlin/JUnit driver writes JUnit XML to build/test-results/e2eTest;
        // Playwright writes JUnit-shaped output to frontend/test-results/.
        xmlReport {
            reportType = XmlReport.XmlReportType.JUNIT
            rules = """
                +:build/test-results/e2eTest/**/*.xml
                +:frontend/test-results/**/*.xml
            """.trimIndent()
        }
    }

    dependencies {
        snapshot(id10CompileUtAuto) {
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }

    requirements {
        doesNotContain("teamcity.agent.jvm.os.name", "Windows", "RQ_E2E_OS")
        // Docker availability is not gated by an explicit capability —
        // agents in the default pool are universal and the e2eTest task
        // will surface a clear error early if no docker daemon is
        // reachable. Re-introduce a capability filter only if the org
        // adds non-Docker agents to the pool.
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

// TEMPORARY: Deploy to prod directly after QA (bypass release chain) — remove after initial prod onboarding
object id25DeployToOkdProdManualTemp : BuildType({
    templates(AbsoluteId("RnDProcessesAutomation_IdpComponentOkdDeploy"))
    id("25DeployToOkdProdManualTemp")
    name = "[2.5] Deploy to OKD PROD [MANUAL][TEMP]"

    params {
        text("OKD_SERVER_URL", "%OKD_SERVER_PROD_URL%", allowEmpty = false)
        param("BUILD_NUMBER", "${id10CompileUtAuto.depParamRefs.buildNumber}")
        param("DEPLOYMENT_ENVIRONMENT", "production")
        param("HELM_EXTRA_SERVICES_SET", "--set image.name=octopusden/%OKD_IMAGE_NAME%")
        text("OKD_SA_TOKEN", "%OKD_SA_PROD_TOKEN%", display = ParameterDisplay.HIDDEN, allowEmpty = true)
    }

    dependencies {
        snapshot(id20DeployToOkdQaManual) {
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
        param("HELM_EXTRA_SERVICES_SET", "--set image.name=octopusden/%OKD_IMAGE_NAME%")
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
