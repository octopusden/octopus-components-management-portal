# AGENTS.md

Guidance for AI agents and developers working on this repository.

## Architecture

Spring Cloud Gateway (WebFlux) + React SPA bundled as static resources.

- **Backend:** Spring Boot 3.x + Spring Cloud Gateway — proxies `/rest/**` to `components-registry-service`
- **Frontend:** React + Vite, built into `src/main/resources/static/` via Gradle `copyFrontendDist` task
- **Config:** Spring Cloud Config client — fetches config from config-server at startup using `VAULT_TOKEN`

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

## Tech Debt

- **BFF layer:** Portal currently proxies `/rest/**` transparently to CRS. As the portal grows
  to aggregate multiple data sources and add business logic, introduce dedicated Spring Boot
  controllers (`/api/**`) that call CRS and other services server-to-server. The transparent
  proxy can be removed once all UI calls go through the portal's own API.

- **Artifactory mirror for Node.js and npm:** Node.js binary and npm packages are downloaded
  directly from nodejs.org/npmjs.org. Requires Artifactory admin to create `nodejs-remote`
  (proxy for nodejs.org/dist) and ensure `npm-virtual` contains the `npm` package.
  See `.teamcity/settings.kts` — placeholders for `node.dist.base.url` and `NPM_CONFIG_REGISTRY`
  are ready, just need to be re-enabled once repos are configured.
