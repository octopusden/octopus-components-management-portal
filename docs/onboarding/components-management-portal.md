# components-management-portal OKD onboarding

**Environment:** prod
**Started:** 2026-04-10
**Last updated:** 2026-06-11

## Prod

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Vault policy & token | ✅ | Policy + token created, stored in KV |
| 2 | Spring Cloud Config | ✅ | Merged to master |
| 3 | Helm values | ✅ | Merged to master |
| 4 | OKD secrets | ✅ | Both secrets created in prod cluster |
| 5 | TeamCity CI/CD | ⏭️ skipped | Already configured in .teamcity/settings.kts (id70DeployToOkdProdManual) |
| 6 | First deploy & verify | ✅ | Pod running, Spring Boot started OK |
| 7 | API Gateway route | ⏭️ skipped | Not needed — using custom domain |
| 8 | Custom domain | ✅ | Prod and QA both served via OKD Ingress + shared wildcard TLS Secret (auto-rotates; no per-renewal redeploy). Done — see [`docs/tech-debt/TD-004-tls-ingress-migration.md`](../tech-debt/TD-004-tls-ingress-migration.md). |
| 9 | OIDC login (Keycloak) | ✅ login / ⚠️ data needs CRS | Login works after three prod fixes: `replicas: 1` (in-memory session — see [TD-003](../tech-debt/TD-003-persisted-session-store.md)), OAuth2 client `jwk-set-uri`, and the prod `f1-api-gateway` client-secret synced into Vault `application-cloud-prod` (per-instance value, **not** QA's). The `auth check failed` banner + `/rest/api/**` 404 persist until `components-registry-service` is deployed to prod — the BFF proxies `/auth/me` and `/rest/**` to it. Reusable detail: `service-deployment/docs/keycloak-authentication.md`. |
