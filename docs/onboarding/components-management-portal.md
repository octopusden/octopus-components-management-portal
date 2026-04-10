# components-management-portal OKD onboarding

**Environment:** prod
**Started:** 2026-04-10
**Last updated:** 2026-04-10

## Prod

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Vault policy & token | ✅ | Policy + token created, stored in KV |
| 2 | Spring Cloud Config | 🔄 in progress | PR created, awaiting approval |
| 3 | Helm values | 🔄 in progress | Branch F1SC-173-prod pushed, pending PR merge |
| 4 | OKD secrets | ✅ | Both secrets created in prod cluster |
| 5 | TeamCity CI/CD | ⏭️ skipped | Already configured in .teamcity/settings.kts (id70DeployToOkdProdManual) |
| 6 | First deploy & verify | ⬜ | |
| 7 | API Gateway route | ⬜ | Included |
| 8 | Custom domain | ⬜ | Included |
