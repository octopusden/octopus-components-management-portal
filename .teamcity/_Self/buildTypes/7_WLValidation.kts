package _Self.buildTypes

import jetbrains.buildServer.configs.kotlin.*

object WLValidation : BuildType({
    templates(AbsoluteId("OctopusWlValidator"))
    id("WLValidation")
    name = "WL Validation"
})
