import jetbrains.buildServer.configs.kotlin.*
import jetbrains.buildServer.configs.kotlin.buildFeatures.XmlReport
import jetbrains.buildServer.configs.kotlin.buildFeatures.freeDiskSpace
import jetbrains.buildServer.configs.kotlin.buildFeatures.xmlReport
import jetbrains.buildServer.configs.kotlin.triggers.finishBuildTrigger
import jetbrains.buildServer.configs.kotlin.triggers.vcs
import jetbrains.buildServer.configs.kotlin.vcs.GitVcsRoot

version = "2025.03"

project {
    vcsRoot(OctopusComponentsManagementPortalVcs)

    params {
        param("COMPONENT_NAME", "components-management-portal")
        param("OCTOPUS_MODULE_NAME", "octopus-components-management-portal")
        param("OKD_IMAGE_NAME", "components-management-portal")
        // Mutable release state: the actual value lives on the parent `Octopus`
        // project (UI-managed, REST-writable) — this project is read-only under
        // versioned settings, so post-processing cannot write a param here.
        param("LAST_RELEASE_VERSION", "%LAST_RELEASE_VERSION_COMPONENTS_MANAGEMENT_PORTAL%")
        // Empty so the OctopusRelease template computes the version at build time
        // (mirrors CRS, which keeps PROJECT_VERSION ""). id40 reads the computed
        // value via id10CompileUtAuto.depParamRefs["PROJECT_VERSION"].
        param("PROJECT_VERSION", "")
        // Base URL for Vite build — set to sub-path (e.g. /components-management-portal/)
        // when serving via API gateway prefix, or "/" when serving from a dedicated domain.
        param("env.VITE_APP_BASE_URL", "/")
    }

    buildType(id10CompileUtAuto)
    buildType(id15E2eAuto)
    buildType(id17BuildValidationAuto)
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
        id17BuildValidationAuto,
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

    // Cap simultaneous runs so a burst of pushes can't tie up every agent.
    maxRunningBuilds = 5

    params {
        param("env.JAVA_HOME", "%env.JDK_ZULU_25_x64%")
        param("ARTIFACT_PATH", """
            build/reports/tests/** => reports/kotlin-tests
            build/reports/kover/** => reports/kotlin-coverage
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

    // Pattern follows id20ftAuto in other Octopus projects: BUILD_VERSION
    // pulls the upstream Compile&UT number, buildNumberPattern renders
    // it. One named param, one place to read.
    buildNumberPattern = "%BUILD_VERSION%"
    // Cap parallel runs — each spins up Postgres/Keycloak/CRS/portal/
    // playwright, so unbounded concurrency would saturate any single
    // agent's docker daemon and disk.
    maxRunningBuilds = 5

    params {
        param("env.JAVA_HOME", "%env.JDK_ZULU_25_x64%")
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
        // Inherit upstream build number — used by buildNumberPattern
        // and available to the gradle template if it needs to tag
        // artefacts.
        param("BUILD_VERSION", "${id10CompileUtAuto.depParamRefs.buildNumber}")
    }

    triggers {
        // Auto-run E2E after every successful Compile&UT, every branch.
        // Mirrors id20ftAuto's pattern.
        finishBuildTrigger {
            id = "TRIGGER_E2E_AFTER_COMPILE_UT"
            buildType = "${id10CompileUtAuto.id}"
            successfulOnly = true
            branchFilter = "+:*"
        }
    }

    failureConditions {
        // Cold first-run is ~15 min (Playwright base image pull); warm
        // runs are ~3-4 min. 60 min is well past any healthy run while
        // catching genuinely runaway containers.
        executionTimeoutMin = 60
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
        // Refuse to start on agents that can't fit the stack: the
        // Playwright base image alone is ~2 GB, plus CRS/Keycloak/
        // Postgres/temurin + Gradle caches + bootJar + npm modules.
        // Containerd blob writes corrupt silently on a full disk —
        // pre-flighting here avoids the failure mode entirely.
        freeDiskSpace {
            id = "BUILD_EXT_E2E_DISK"
            requiredSpace = "10gb"
            failBuild = true
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

object id17BuildValidationAuto : BuildType({
    templates(AbsoluteId("RDDepartment_PostGithubStatus"))
    id("17BuildValidationAuto")
    name = "[1.7] Build Validation [AUTO]"

    // Needed so %build.vcs.number% (COMMIT_SHA) resolves to the revision built.
    vcs {
        root(OctopusComponentsManagementPortalVcs)
    }

    triggers {
        vcs {
            branchFilter = "+:*"
        }
    }

    dependencies {
        snapshot(id10CompileUtAuto) {
            onDependencyFailure = FailureAction.ADD_PROBLEM
            reuseBuilds = ReuseBuilds.ANY
        }
        snapshot(id15E2eAuto) {
            onDependencyFailure = FailureAction.ADD_PROBLEM
            reuseBuilds = ReuseBuilds.ANY
        }
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
        // E2E is a release blocker: release can only cut when [1.5] E2E passed for
        // the SAME source revision. id15 and id20 both snapshot id10, so TeamCity
        // pins all three to one id10 build — release params still come from id10,
        // id15 only gates (it is not a source of release parameters).
        snapshot(id15E2eAuto) {
            onDependencyFailure = FailureAction.FAIL_TO_START
        }
    }
})

object id50ReleasePostProcessingAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusComponents_HOctopusTest_OctopusReleasePostProcessing"))
    id("50ReleasePostProcessingAuto")
    name = "[4.0] Release Post Processing [AUTO]"
    // LAST_RELEASE_VERSION is inherited from the project level; do NOT redeclare it
    // here (`LAST_RELEASE_VERSION = %LAST_RELEASE_VERSION%` is a circular
    // self-reference).

    params {
        // Redirect the template's "Update latest release version" step to the
        // parent `Octopus` project: this project is read-only (versioned
        // settings), so a REST PUT against it gets 500 ReadOnlyEntityException.
        param("TEAMCITY_UPDATE_PROJECT_IDS", "Octopus")
        param("TEAMCITY_UPDATE_PARAMETER_NAME", "LAST_RELEASE_VERSION_COMPONENTS_MANAGEMENT_PORTAL")
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
