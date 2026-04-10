#!/usr/bin/env bash
#
# Creates Vault policy and service token for components-management-portal
# in the PROD (cloud-prod) environment.
#
# What this script does:
#   1. Authenticates to Vault using the provided admin token
#   2. Creates ACL policy "f1-config-server-components-management-portal-prod"
#      that grants read access to the service's KV paths in the
#      f1-config-server secrets engine (KV v2)
#   3. Verifies the policy was created correctly
#   4. Generates a long-lived service token (10 years) bound to that policy
#
# The resulting service token is used by Spring Cloud Config Server to read
# Vault secrets on behalf of the portal application. The token is passed
# from the pod via X-Config-Token header → Config Server → Vault (X-Vault-Token).
#
# After running this script:
#   - Save the token and accessor to f1-config-server-deployment/tokens in Vault
#   - Create OKD secret with the token (see instructions at the end of output)
#
# Prerequisites:
#   - vault CLI installed (brew install hashicorp/tap/vault)
#   - Admin token with policy-write and token-create capabilities
#
# Usage:
#   VAULT_ADDR=https://vault.example.com VAULT_TOKEN=<admin-token> ./infra/vault/create-policy-and-token-prod.sh
#

set -euo pipefail

: "${VAULT_ADDR:?Set VAULT_ADDR before running this script (e.g. https://vault.example.com)}"
export VAULT_ADDR

POLICY_NAME="f1-config-server-components-management-portal-prod"
POLICY_FILE="$(dirname "$0")/f1-config-server-components-management-portal-prod.hcl"

echo "=== Step 1: Authenticate ==="
echo "Vault: ${VAULT_ADDR}"
vault login "$VAULT_TOKEN"

echo ""
echo "=== Step 2: Create policy '${POLICY_NAME}' ==="
echo "Policy file: ${POLICY_FILE}"
vault policy write "$POLICY_NAME" "$POLICY_FILE"

echo ""
echo "=== Step 3: Verify policy ==="
vault policy read "$POLICY_NAME"

echo ""
echo "=== Step 4: Create service token (TTL=87600h / ~10 years) ==="
vault token create -ttl=87600h -policy="$POLICY_NAME"

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Save token and accessor to Vault KV:"
echo "     f1-config-server-deployment/tokens/components-management-portal-prod-token"
echo "     f1-config-server-deployment/tokens/components-management-portal-prod-token-accessor"
echo ""
echo "  2. Create OKD secret:"
echo "     oc create secret generic components-management-portal-cloud-prod -n f1 \\"
echo "       --from-literal=\"VAULT_TOKEN=<token-from-step-4>\""
