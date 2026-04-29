# TD-003: Persisted Spring session store on Portal gateway

## Status

Open.

## Context

The Portal Spring Cloud Gateway is the BFF: it holds the OAuth2 access token in a server-side session, and Gateway's `TokenRelay` default-filter forwards `Authorization: Bearer <token>` on proxied calls.

Today, the session store is **in-memory** (Spring's default `MapSession` / `InMemoryReactiveSessionRepository`). When the portal pod restarts (deploy, OOM, OKD reschedule), every browser session is dropped on the floor. Users see a sudden redirect to `/oauth2/authorization/keycloak` mid-action, lose unsaved edits in any open form, and have to re-authenticate.

For a small admin tool this is annoying but not catastrophic. As the Portal becomes more central — and as we run more than one replica behind the OKD route — this becomes a real availability problem:

- Two-pod deploys: a session created on pod A is invalid on pod B; even with sticky sessions, a rolling deploy drops half the sessions.
- Cross-region or HA deployments: not addressable with the current model.

## Proposed work

Pick one persistent store and wire it via `spring-session-*` autoconfiguration:

| Option | Notes |
|---|---|
| **Redis** | Via `spring-session-data-redis`. Lowest friction if a Redis instance is already managed in the cluster. The DMS service uses Redis for its own session store — same pattern. |
| **JDBC (PostgreSQL)** | Via `spring-session-jdbc`. Reuses the existing CRS PostgreSQL (or a small dedicated schema). Simpler ops if no Redis exists. Trade-off: every session touch is a DB write. |
| **Hazelcast / Infinispan** | Heavier weight. Skip unless there's a non-session reason to introduce them. |

Recommended: **Redis** (matches DMS pattern, lowest write cost), unless a strong "no new infra" preference points to JDBC.

### Migration path

1. Add the `spring-session-*` dependency.
2. Configure the store via `application.yaml` (`spring.session.store-type: redis`, etc.).
3. Wire the connection details into the existing Spring Cloud Config / Vault setup (see `infra/vault/`).
4. Verify cookie flags (`SameSite`, `Secure`, `HttpOnly`) survive the change — they are set by `CookieServerCsrfTokenRepository.withHttpOnlyFalse()` for CSRF and by Spring Session for the session cookie.
5. Test: roll the portal pod during an active session; the same session should keep working without re-auth.

## Out of scope

- Cross-cluster session replication (different problem).
- Replacing the BFF pattern with a stateless JWT-on-cookie scheme (would also avoid this problem but is a much bigger architectural change — see CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md) for why we're a BFF).
- Front-channel logout fan-out across multiple pods (Spring Session handles this if the chosen store is shared).

## Acceptance criteria

1. Restarting the Portal pod during an active browser session does not log the user out.
2. With two Portal replicas behind the OKD route, a request hitting either replica resolves to the same session.
3. Existing CSRF policy and the entry-point split (401 for `/rest/**`, redirect for navigations) continue to work unchanged.
4. The Vault / Spring Cloud Config wiring for the chosen store credentials is documented in `docs/onboarding/components-management-portal.md`.

## References

- CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md) §"Risks" — flags this gap.
- DMS service uses Redis for its own session store — pattern to copy.
- Session config currently lives implicitly in Spring defaults (no explicit `spring.session.*` settings in `application.yaml`).
