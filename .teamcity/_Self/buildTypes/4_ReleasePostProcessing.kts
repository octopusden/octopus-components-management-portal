package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

object id50ReleasePostProcessingAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusComponents_HOctopusTest_OctopusReleasePostProcessing"))
    id("50ReleasePostProcessingAuto")
    name = "[4.0] Release Post Processing [AUTO]"

    params {
        param("LAST_RELEASE_VERSION", "%LAST_RELEASE_VERSION%")
    }
})
