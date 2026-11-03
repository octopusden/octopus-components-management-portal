package org.octopusden.octopus.components.portal.configuration

import org.springframework.boot.context.properties.ConfigurationProperties

enum class VcsProvider {
    BITBUCKET,
    GITEA,
}

@ConfigurationProperties(prefix = "portal.links")
class PortalLinksProperties {
    var jiraBaseUrl: String? = null
    var gitBaseUrl: String? = null
    var tcBaseUrl: String? = null
    var dmsBaseUrl: String? = null
    var vcsProvider: VcsProvider? = null
}
