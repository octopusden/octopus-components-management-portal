package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

object id10CompileUtAuto : BuildType({
    templates(AbsoluteId("Octopus_OctopusGradleBuild"))
    id("10CompileUtAuto")
    name = "[1.0] Compile & UT [AUTO]"

    params {
        param("env.JAVA_HOME", "%env.JDK_ZULU_21_x64%")
        param("ARTIFACT_PATH", "")
        param("GRADLE_TASK", "clean build publishToMavenLocal dockerPushImage -info")
    }

    steps {
        step {
            name = "Install nodejs"
            id = "Install_nodejs"
            type = "jonnyzzz.nvm"
            param("version", "22.22.2")
        }
        stepsOrder = arrayListOf("RUNNER_1720", "Install_nodejs", "RUNNER_1768")
    }

    requirements {
        doesNotContain("teamcity.agent.jvm.os.name", "Windows", "RQ_2816")
    }
})
