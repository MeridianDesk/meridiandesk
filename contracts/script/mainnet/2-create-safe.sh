#!/usr/bin/env bash
# Robinhood Chain MAINNET — step 2: create the Meridian admin Safe (Safe v1.4.1 canonical contracts, verified on 4663).
# Usage (from contracts/):
#   OWNERS=0xOwnerA,0xOwnerB,0xOwnerC THRESHOLD=2 bash script/mainnet/2-create-safe.sh
# Paid by the mainnet deployer keystore. Owners should be hardware/separate keys, never the deployer.
set -euo pipefail
RH_RPC_MAINNET=$(grep "^RH_RPC_MAINNET=" .env | cut -d= -f2-)   # only the RPC; never import testnet ADMIN/USDG/keys
RPC="${RPC:-$RH_RPC_MAINNET}"
ACCOUNT=${ACCOUNT:-meridian-deployer}
: "${OWNERS:?OWNERS=0x..,0x.. required}"; THRESHOLD=${THRESHOLD:-2}

FACTORY=0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67   # SafeProxyFactory 1.4.1
SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 # SafeL2 1.4.1
HANDLER=0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99   # CompatibilityFallbackHandler 1.4.1
ZERO=0x0000000000000000000000000000000000000000

[ "$(cast chain-id --rpc-url "$RPC")" = 4663 ] || { echo "RPC is not mainnet 4663"; exit 1; }
for a in $FACTORY $SINGLETON $HANDLER; do [ "$(cast codesize $a --rpc-url "$RPC")" -gt 0 ] || { echo "no code at $a"; exit 1; }; done
N=$(echo "$OWNERS" | tr ',' '\n' | grep -c .)
[ "$THRESHOLD" -ge 2 ] && [ "$THRESHOLD" -le "$N" ] || { echo "THRESHOLD must be 2..$N"; exit 1; }
echo "$OWNERS" | tr ',' '\n' | grep -qi 0x84811fa225461c24285E16F331Ec942ac9a1C199 && { echo "exposed testnet key cannot be an owner"; exit 1; }

INIT=$(cast calldata "setup(address[],uint256,address,bytes,address,address,uint256,address)" \
  "[$OWNERS]" "$THRESHOLD" $ZERO 0x $HANDLER $ZERO 0 $ZERO)
SALT=${SALT:-$(date +%s)}
echo "Creating Safe: owners=[$OWNERS] threshold=$THRESHOLD salt=$SALT"
read -r -p "Broadcast on MAINNET? type yes: " ok; [ "$ok" = yes ] || exit 1

TX=$(cast send $FACTORY "createProxyWithNonce(address,bytes,uint256)" $SINGLETON "$INIT" "$SALT" \
  ${SIGNER:---account $ACCOUNT} --rpc-url "$RPC" --async)
echo "tx $TX"
# ProxyCreation(address indexed proxy, address singleton)
TOPIC=$(cast keccak "ProxyCreation(address,address)")
SAFE=$(cast receipt "$TX" --json --rpc-url "$RPC" | python3 -c "
import json,sys
r=json.load(sys.stdin)
assert r['status'] in ('0x1',1), 'tx failed'
for l in r['logs']:
    if l['topics'][0].lower()=='$TOPIC'.lower(): print('0x'+l['topics'][1][-40:])")
SAFE=$(cast to-check-sum-address "$SAFE")
echo "SAFE  $SAFE"
echo "owners    $(cast call "$SAFE" 'getOwners()(address[])' --rpc-url "$RPC")"
echo "threshold $(cast call "$SAFE" 'getThreshold()(uint256)' --rpc-url "$RPC")"
echo "Explorer: https://robinhoodchain.blockscout.com/address/$SAFE"
