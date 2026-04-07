package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

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
