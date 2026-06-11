# TD-004: TLS migration to Ingress + shared wildcard Secret on prod (`ocpm`)

## Status

**Done.** Both prod (`ocpm`) and QA (`ocpd`) are served via an OKD `Ingress` referencing the shared wildcard TLS Secret; the cert auto-rotates with the Secret, no per-renewal redeploy.

This work was previously tracked as a sub-bullet under step 8 of [`docs/onboarding/components-management-portal.md`](../onboarding/components-management-portal.md). It was broken out into its own tech-debt entry because (a) it is a one-off operational deliverable rather than an onboarding step, and (b) the deadline made it worth tracking explicitly.

## Resolution

- The wildcard TLS Secret already existed and was current on `ocpm` — no platform-team provisioning was needed (Work item 1 was a no-op).
- Applied an OKD `Ingress` (host = prod portal domain, `secretName` = shared wildcard) mirroring the QA Ingress, confirmed the synthesized Route was admitted and serving the wildcard cert, then deleted the old inline-TLS `Route`.
- Prod HTTPS now serves the shared wildcard cert and auto-rotates. Note: the prod inline cert had actually **expired** before the cutover (the portal was down on TLS), so this turned out to be a recovery, not just preventive.
- **Residual:** the Ingress was applied imperatively (`oc apply`), not committed as a manifest (the QA Ingress is likewise not in-repo). If we want declarative TLS, add the Ingress manifests under `infra/okd/` and/or have the Helm chart render an Ingress instead of an inline-TLS Route. Tracked loosely; not blocking.
- The reusable lesson (use Ingress + `secretName`, never inline cert/key into a Route) now lives in the `service-deployment` okd-onboard skill (Step 8) and `keycloak-authentication.md`.

## Context

The prod portal is currently exposed via an **OKD `Route` with inline TLS** — the certificate and private key are embedded in the Route resource itself. That cert expires **2026-05-07**.

The QA portal already runs on the new pattern: an **OKD `Ingress` (`f1-components-management-portal-test` on cluster `ocpd`)** with TLS terminated at the cluster edge using a **shared wildcard Secret**. That migration was completed 2026-04-28. The same pattern needs to land on prod (cluster `ocpm`) before the inline cert expires, otherwise the prod portal goes dark.

## Work

1. **Provision the wildcard TLS Secret on `ocpm`** (the equivalent of what was done on `ocpd` for QA). Coordinate with platform team — the secret name and namespace need to match the Ingress reference.
2. **Author the prod Ingress manifest** mirroring the QA Ingress (`f1-components-management-portal-test`). Likely path: `infra/okd/ingress-prod.yaml` (does not yet exist).
3. **Cut over** — apply the new Ingress, validate that the portal answers on the prod hostname over HTTPS through it, then remove the inline-TLS Route. The window between "Ingress works" and "Route removed" should be as short as possible to avoid two valid TLS endpoints serving the same hostname.
4. **Update `docs/onboarding/components-management-portal.md`** step 8 to reflect "✅ done — Ingress + shared wildcard" once shipped, replacing the current "⚠️ pending TLS migration".

## Cross-references

- QA pattern proven on `ocpd`: Ingress `f1-components-management-portal-test`, completed 2026-04-28.
- Onboarding doc step 8 (current pending state): [`docs/onboarding/components-management-portal.md`](../onboarding/components-management-portal.md).
- Vault / OKD bootstrap scripts: [`infra/vault/`](../../infra/vault/), [`infra/okd/`](../../infra/okd/).

## Acceptance criteria

1. `https://<prod-portal-hostname>/portal/info` answers 200 with the portal build label, served via the new Ingress + wildcard secret (verifiable in the cert chain).
2. The old prod `Route` with inline TLS is deleted.
3. The wildcard Secret rotation runbook is owned by platform team (i.e. when the wildcard cert renews, the portal does not need a re-deploy).
4. Onboarding doc step 8 reads "✅ Ingress + shared wildcard Secret" with the post-cutover date.

## Out of scope

- Migrating other components-* services to the same pattern (different timelines, different teams).
- Changing portal-internal TLS (none — TLS terminates at the Ingress, the JVM serves plain HTTP inside the cluster).

## Why deadline-tracked

If we miss 2026-05-07, the inline cert expires, and the portal returns TLS handshake failures until either:
- the Route's inline cert is rotated (manual, fragile — the reason we want Ingress in the first place), or
- the Ingress is in place and the Route is replaced.

A few days of buffer before 2026-05-07 is the right target.
