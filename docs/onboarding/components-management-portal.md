# components-management-portal OKD onboarding

**Environment:** prod
**Started:** 2026-04-10
**Last updated:** 2026-04-28

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
| 8 | Custom domain | ✅ | Ingress `f1-components-management-portal-test` referencing the shared wildcard TLS Secret; auto-rotates with the Secret |
