# AGENTS.md

Guidance for AI agents and developers working on this repository.

## Architecture

Spring Cloud Gateway (WebFlux) + React SPA bundled as static resources.

- **Backend:** Spring Boot 3.x + Spring Cloud Gateway — proxies `/rest/**` to `components-registry-service`
- **Frontend:** React + Vite, built into `src/main/resources/static/` via Gradle `copyFrontendDist` task
- **Config:** Spring Cloud Config client — fetches config from config-server at startup using `VAULT_TOKEN`

## Known Issues

### Static assets 404 in Spring Cloud Gateway

**Problem:** `WebFluxConfigurer.addResourceHandlers()` is ignored in Spring Cloud Gateway applications.
The Gateway's `RoutePredicateHandlerMapping` intercepts all requests and returns 404 for paths
that don't match a configured route — including `/assets/**`.

**Reproducing test:** `StaticResourcesTest` — must fail before fix, pass after.

**Fix required:** Replace `WebFluxConfigurer.addResourceHandlers()` with a `RouterFunction<ServerResponse>`
bean that explicitly serves classpath static resources, registered with higher priority than the Gateway handler.

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

## Test Backlog

- **Context smoke test:** lightweight `@SpringBootTest` that just checks `contextLoads` or
  `/actuator/health` without static fixtures — validates app starts correctly in isolation.

- **Packaging pipeline test:** integration test that uses the actual frontend build output
  (`build/resources/main/static/`) instead of `src/test/resources/static/`. Currently
  `StaticResourcesTest` tests the serving *mechanism* but not the Gradle `copyFrontendDist`
  task wiring (build.gradle.kts:132). A broken packaging step would not be caught.

- **Gateway proxy test:** test on `/rest/**` with a stub backend (WireMock or MockWebServer)
  to verify the Gateway actually routes to `components-registry-service` and doesn't silently
  fall through to the SPA fallback.

- **Config client test:** test startup with a stub Config Server or test profile to catch
  regressions in the bootstrap/Vault config path without requiring a real config-server.
