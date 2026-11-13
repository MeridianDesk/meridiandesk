#!/usr/bin/env bash
# Rotate the Options QUOTER on mainnet via the admin Safe:
#   grantRole(QUOTER_ROLE, NEW) + revokeRole(QUOTER_ROLE, OLD) in one batch, then executes it
#   with safe-exec-batch.sh (you type the safe-owner passwords, then "yes").
# Usage: bash script/mainnet/rotate-quoter.sh 0xNEW_QUOTER_ADDRESS
#   DRY=1 to only build + print the batch.
set -euo pipefail
cd "$(dirname "$0")/../.."

NEW=${1:?new quoter address}
OLD=${OLD:-0x558e58aE6DfA7C3a10b612A21d2b7025c04EC885}
OPTIONS=0xDC44F3e91B782584eEd60D1e3E57F3638217aA21
RPC=${RPC:-https://robinhood-rpc.publicnode.com}
OUT=script/mainnet/batches/03-rotate-quoter.json

[[ $NEW =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "bad address: $NEW"; exit 1; }
NEW=$(cast to-check-sum-address "$NEW")
case "$NEW" in
  0x84811fa225461c24285E16F331Ec942ac9a1C199|0xe1e7971e37152eE72A0791949ce98A2A3c34C843)
    echo "refusing: $NEW is a leaked/burned key"; exit 1;;
esac

ROLE=$(cast keccak QUOTER_ROLE)
G=$(cast calldata "grantRole(bytes32,address)" "$ROLE" "$NEW")
R=$(cast calldata "revokeRole(bytes32,address)" "$ROLE" "$OLD")

python3 - "$OUT" "$OPTIONS" "$G" "$R" "$NEW" "$OLD" <<'PY'
import json, sys
out, opt, g, r, new, old = sys.argv[1:]
json.dump({"version": "1.0", "chainId": "4663", "meta": {"name": "Meridian: rotate options quoter"},
  "transactions": [
    {"to": opt, "value": "0", "data": g, "description": f"OptionsEngine.grantRole QUOTER_ROLE -> {new}"},
    {"to": opt, "value": "0", "data": r, "description": f"OptionsEngine.revokeRole QUOTER_ROLE <- {old}"},
  ]}, open(out, "w"), indent=2)
PY
echo "wrote $OUT"

DRY=${DRY:-} bash script/mainnet/safe-exec-batch.sh "$OUT"

if [ -z "${DRY:-}" ]; then
  echo "new quoter role: $(cast call $OPTIONS 'hasRole(bytes32,address)(bool)' "$ROLE" "$NEW" --rpc-url "$RPC")"
  echo "old quoter role: $(cast call $OPTIONS 'hasRole(bytes32,address)(bool)' "$ROLE" "$OLD" --rpc-url "$RPC")"
fi
