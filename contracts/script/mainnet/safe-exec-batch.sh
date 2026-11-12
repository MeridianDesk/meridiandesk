#!/usr/bin/env bash
# Execute a Safe Transaction Builder JSON batch on the Meridian admin Safe (2-of-3) from the terminal.
# Usage: bash script/mainnet/safe-exec-batch.sh script/mainnet/batches/01-list-tsla-perps.json
# Signs the safeTxHash with safe-owner1 + safe-owner2 (cast keystores, YOU type the passwords),
# simulates execTransaction, then asks "yes" before sending it from safe-owner2.
#   DRY=1      only print the batch + safeTxHash
#   RPC=...    override (e.g. an anvil fork for rehearsal); SIGN_PK_A/SIGN_PK_B for fork tests only
set -euo pipefail

FILE=${1:?batch json}
RPC=${RPC:-https://robinhood-rpc.publicnode.com}
SAFE=${SAFE:-0xeEa7FA2dD4CA77DD230ca4A41eB46ec8A3D89D38}
MULTISEND=0x9641d764fc13c8B624c04430C7356C1C7C8102e2 # MultiSendCallOnly v1.4.1
SIGNER_A=${SIGNER_A:-safe-owner1}
SIGNER_B=${SIGNER_B:-safe-owner2}
ZERO=0x0000000000000000000000000000000000000000

PACKED=$(python3 - "$FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert str(d.get("chainId")) == "4663", "wrong chain"
out = ""
for t in d["transactions"]:
    data = t["data"][2:]
    out += "00" + t["to"][2:].lower().rjust(40, "0") + format(int(t["value"]), "064x") \
        + format(len(data) // 2, "064x") + data
print("0x" + out)
PY
)
python3 -c "import json;[print(' -',t['description']) for t in json.load(open('$FILE'))['transactions']]"
DATA=$(cast calldata "multiSend(bytes)" "$PACKED")
NONCE=$(cast call $SAFE "nonce()(uint256)" --rpc-url "$RPC")
HASH=$(cast call $SAFE "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  $MULTISEND 0 "$DATA" 1 0 0 0 $ZERO $ZERO "$NONCE" --rpc-url "$RPC")
echo "Safe $SAFE | nonce $NONCE | safeTxHash $HASH"
[ "${DRY:-0}" = 1 ] && exit 0

if [ -n "${SIGN_PK_A:-}" ]; then # fork rehearsal only
  SA=$(cast wallet sign --no-hash --private-key "$SIGN_PK_A" "$HASH"); AA=$(cast wallet address --private-key "$SIGN_PK_A")
  SB=$(cast wallet sign --no-hash --private-key "$SIGN_PK_B" "$HASH"); AB=$(cast wallet address --private-key "$SIGN_PK_B")
else
  echo "Password $SIGNER_A (sign):"; SA=$(cast wallet sign --no-hash --account "$SIGNER_A" "$HASH"); AA=$(cast wallet address --account "$SIGNER_A")
  echo "Password $SIGNER_B (sign):"; SB=$(cast wallet sign --no-hash --account "$SIGNER_B" "$HASH"); AB=$(cast wallet address --account "$SIGNER_B")
fi
# Safe requires signatures sorted by owner address ascending.
SIGS=$(python3 -c "
a=[('$AA'.lower(),'$SA'[2:]),('$AB'.lower(),'$SB'[2:])];a.sort();print('0x'+''.join(s for _,s in a))")

SIG="execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)"
echo "Simulating..."
OK=$(cast call $SAFE "$SIG" $MULTISEND 0 "$DATA" 1 0 0 0 $ZERO $ZERO "$SIGS" --from "$AB" --rpc-url "$RPC")
GAS=$(cast estimate $SAFE "$SIG" $MULTISEND 0 "$DATA" 1 0 0 0 $ZERO $ZERO "$SIGS" --from "$AB" --rpc-url "$RPC")
echo "Simulation: $OK | gas: $GAS"
[ "$OK" = true ] || { echo "Simulation failed, not sending."; exit 1; }
if [ -z "${SIGN_PK_A:-}" ]; then
  read -r -p "Send execTransaction from $SIGNER_B ($AB)? type yes: " C
  [ "$C" = yes ] || { echo "Aborted."; exit 1; }
  echo "Password $SIGNER_B (send):"
  cast send $SAFE "$SIG" $MULTISEND 0 "$DATA" 1 0 0 0 $ZERO $ZERO "$SIGS" \
    --account "$SIGNER_B" --gas-limit $((GAS * 13 / 10)) --rpc-url "$RPC"
else
  cast send $SAFE "$SIG" $MULTISEND 0 "$DATA" 1 0 0 0 $ZERO $ZERO "$SIGS" \
    --from "$AB" --unlocked --gas-limit $((GAS * 13 / 10)) --rpc-url "$RPC" >/dev/null && echo "sent (fork)"
fi
