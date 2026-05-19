#!/usr/bin/env bash
# One-shot deploy: storage (public read JSON) + tiny Function (save with secret key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AZURE_DIR="$(cd "$(dirname "$0")" && pwd)"

RG="${ROADTRIP_AZURE_RG:-rg-roadtrip-map-live}"
LOCATION="${ROADTRIP_AZURE_LOCATION:-swedencentral}"
WRITE_KEY="${ROADTRIP_WRITE_KEY:-$(openssl rand -hex 24)}"

echo "==> Resource group: $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --output none

echo "==> Deploying storage + function app (Bicep)…"
DEPLOY_JSON="$(
  az deployment group create \
    --resource-group "$RG" \
    --template-file "$AZURE_DIR/main.bicep" \
    --parameters "writeKey=$WRITE_KEY" \
    --query properties.outputs \
    -o json
)"

LIVE_URL="$(echo "$DEPLOY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['liveStateUrl']['value'])")"
API_URL="$(echo "$DEPLOY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['tripSyncApiUrl']['value'])")"
FUNC_NAME="$(echo "$DEPLOY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['functionAppName']['value'])")"
STORAGE_NAME="$(echo "$DEPLOY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['storageAccountName']['value'])")"

echo "==> Building function zip…"
FUNC_DIR="$AZURE_DIR/function"
BUILD_DIR="$AZURE_DIR/.deploy-function"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp "$FUNC_DIR/host.json" "$BUILD_DIR/"
cp "$FUNC_DIR/package.json" "$BUILD_DIR/"
cp -R "$FUNC_DIR/src" "$BUILD_DIR/"
(
  cd "$BUILD_DIR"
  npm install --omit=dev --silent
  zip -qr "$AZURE_DIR/function.zip" .
)

echo "==> Publishing function code…"
az functionapp deployment source config-zip \
  --resource-group "$RG" \
  --name "$FUNC_NAME" \
  --src "$AZURE_DIR/function.zip" \
  --output none

echo "==> Seeding live-state.json…"
INITIAL='{"visitedWaypointIds":[],"customWaypoints":[],"removedDefaultIds":[]}'
echo "$INITIAL" > "$AZURE_DIR/initial-live-state.json"
az storage blob upload \
  --account-name "$STORAGE_NAME" \
  --container-name trip \
  --name live-state.json \
  --file "$AZURE_DIR/initial-live-state.json" \
  --overwrite \
  --content-type application/json \
  --auth-mode key \
  --output none

OUT="$AZURE_DIR/deploy-output.env"
cat > "$OUT" <<EOF
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") — keep WRITE_KEY private
ROADTRIP_AZURE_RG=$RG
ROADTRIP_AZURE_LOCATION=$LOCATION
VITE_LIVE_STATE_URL=$LIVE_URL
VITE_TRIP_SYNC_API_URL=$API_URL
ROADTRIP_WRITE_KEY=$WRITE_KEY
EOF

echo ""
echo "=============================================="
echo "Klart. Lägg detta i .env (och GitHub secrets):"
echo "=============================================="
echo "VITE_LIVE_STATE_URL=$LIVE_URL"
echo "VITE_TRIP_SYNC_API_URL=$API_URL"
echo ""
echo "Din privata länk (spara, dela INTE):"
echo "  ?key=$WRITE_KEY"
echo ""
echo "Familj: vanlig sid-URL (utan ?key=). De läser JSON ovan."
echo ""
echo "Sparat lokalt: $OUT"
echo "Resource group: $RG"
