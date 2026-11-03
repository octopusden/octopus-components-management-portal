package org.octopusden.octopus.components.portal.configuration

import org.springframework.boot.context.properties.ConfigurationProperties

enum class VcsProvider {
    BITBUCKET,
    GITEA,
}

@ConfigurationProperties(prefix = "portal")
class PortalVcsProperties {
    var vcsProvider: VcsProvider? = null
}
