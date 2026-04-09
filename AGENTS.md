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
