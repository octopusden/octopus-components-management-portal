package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

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
