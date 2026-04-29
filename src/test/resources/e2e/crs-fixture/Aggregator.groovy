// Minimal aggregator for the portal e2e stack. Mirrors the upstream
// test-common/src/test/resources/components-registry/common/Aggregator.groovy
// pattern but trimmed: one component is enough for the smoke spec, which
// only asserts `count > 0` and reads `data.content[0].id`.
import org.octopusden.octopus.escrow.resolvers.ComposedConfigScript

class Aggregator extends ComposedConfigScript {
    def run() {
        include("Defaults.groovy")
        include("Tools.groovy")
        include("TestComponents.groovy")
    }

    static final ANY_ARTIFACT = /[\w-\.]+/
    static final ALL_VERSIONS = "(,0),[0,)"
}
