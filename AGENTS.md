# AGENTS.md

Guidance for AI agents and developers working on this repository.

## Architecture

See [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md)
in `octopus-components-registry-service` for the full architectural rationale and request flow diagram.

**In brief:** Spring Cloud Gateway (WebFlux) + React SPA. Browser JS calls `/rest/**` on the same
origin — the portal proxies to `components-registry-service`. No CORS, no BFF layer (yet).

## Build Commands

```bash
# Full build (includes frontend)
./gradlew build

# Backend only (skip frontend)
./gradlew build -x npmCi -x npmBuild -x copyFrontendDist

# Run tests
./gradlew test

# Frontend lint + typecheck
./gradlew qualityStatic

# Frontend test coverage
./gradlew qualityCoverage
```

## Testing

- Kotlin tests: `src/test/kotlin/`
- Frontend tests: `frontend/src/**/*.test.tsx`
- Test fixtures (static assets for WebFlux tests): `src/test/resources/static/`

When writing tests, always write a failing test first that reproduces the bug,
then fix the production code until the test passes.
