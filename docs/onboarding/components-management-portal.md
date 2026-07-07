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

## Runtime dependencies & required prod config

The Portal is a BFF/gateway; it has no data of its own. Two backend services and one scaling
constraint must be accounted for before/at prod deploy:

- **components-registry-service (CRS) — deploy first.** The BFF proxies `/auth/**` and `/rest/**`
  to CRS, so the Portal shows the `auth check failed` banner and `/rest/**` 404s until CRS is live
  in prod. **Deploy ordering is CRS → Portal.**
- **Release Management service — set `RELEASE_MANAGEMENT_SERVICE_URL` in prod config.** The "Validation
  Problems" facility reconciles CRS components against Release Management builds; it needs the RM
  service URL (env `RELEASE_MANAGEMENT_SERVICE_URL`, https). Without it that facility is degraded/empty
  (the rest of the Portal still works). Wire it the same way QA does.
- **Single replica only (`replicas: 1`).** The BFF keeps sessions in-memory, so more than one replica
  splits sessions across pods and breaks auth. Persisting sessions to an external store (which would
  lift this limit) is tracked in [TD-003](../tech-debt/TD-003-persisted-session-store.md) /
  [issue #96](https://github.com/octopusden/octopus-components-management-portal/issues/96) — until
  then prod stays pinned to one replica.

### Onboarding video (optional feature — OFF until configured)

The header "Watch intro" button + first-login coachmark only appear once the portal has cloned a
presentation video into memory at startup. The media lives in a **small dedicated git repo**
(e.g. Bitbucket), NOT in the portal jar/image. With `PORTAL_ONBOARDING_VIDEO_VCS_ROOT` blank
(the default) the feature is fully off and nothing is cloned — so this is a deliberate rollout step,
not a deploy blocker.

To enable, create the media repo (commit `intro.mp4`, optionally a poster e.g. `poster.jpg`), grant
the portal's service account read access, then set:

- **Non-secret (Spring Cloud Config / Helm values):** `PORTAL_ONBOARDING_VIDEO_VCS_ROOT` (git URL),
  `PORTAL_ONBOARDING_VIDEO_VCS_BRANCH` (blank → default branch), `PORTAL_ONBOARDING_VIDEO_PATH`
  (default `intro.mp4`), `PORTAL_ONBOARDING_VIDEO_POSTER_PATH` (blank → no poster).
- **Secret (Vault → OKD secret), only if the repo isn't anonymously readable:**
  `PORTAL_ONBOARDING_VIDEO_VCS_USERNAME`, `PORTAL_ONBOARDING_VIDEO_VCS_PASSWORD`.

The clone is async and non-fatal (a bad URL never blocks boot; it just leaves the feature hidden and
retries on a slow schedule), and the video is served same-origin behind portal auth.
