#!/usr/bin/env bash
#
# Creates OKD secret with VAULT_TOKEN for components-management-portal
# in the QA (cloud-qa) environment.
#
# This secret is mounted as env var in the pod by the Helm chart.
# The pod uses VAULT_TOKEN to authenticate with Spring Cloud Config Server,
# which in turn reads Vault secrets on behalf of the application.
#
# Prerequisites:
#   - oc CLI logged in to the QA cluster (oc login <cluster-url> --web)
#   - SERVICE_TOKEN from the Vault token creation step
#
# Usage:
#   SERVICE_TOKEN=<token-from-vault> ./infra/okd/create-okd-secret-qa.sh
#

set -euo pipefail

: "${SERVICE_TOKEN:?Set SERVICE_TOKEN (Vault token from create-policy-and-token-qa.sh)}"

NAMESPACE="f1"
SECRET_NAME="components-management-portal-cloud-qa"

echo "=== Verify OKD login ==="
oc whoami
oc project "$NAMESPACE"

echo ""
echo "=== Create secret '${SECRET_NAME}' in namespace '${NAMESPACE}' ==="
oc create secret generic "$SECRET_NAME" -n "$NAMESPACE" \
  --from-literal="VAULT_TOKEN=${SERVICE_TOKEN}"

echo ""
echo "=== Verify ==="
oc get secret "$SECRET_NAME" -n "$NAMESPACE"

echo ""
echo "=== Done ==="
