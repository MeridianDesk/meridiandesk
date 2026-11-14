#!/usr/bin/env bash
# Robinhood Chain MAINNET — step 4: Common Ledger (Cross margin).
#   a) deploy InsuranceFund + CrossMarginAccount + CrossOptionBook, admin = Safe from the constructor
#      (the broadcaster only pays gas, holds no role);
#   b) write Safe batch 05 (roles, option book, TSLA market, small caps) for safe-exec-batch.sh.
# Usage (from contracts/):
#   ACCOUNT=<keystore that pays gas> bash script/mainnet/4-deploy-cross.sh
#   CAP_ACCOUNT / CAP_TOTAL / OI (USDG, whole units) override the guarded-launch limits.
# Then: bash script/mainnet/safe-exec-batch.sh script/mainnet/batches/05-enable-cross.json
set -euo pipefail
RH_RPC_MAINNET=$(grep "^RH_RPC_MAINNET=" .env | cut -d= -f2-)
RPC="${RPC:-$RH_RPC_MAINNET}"
ACCOUNT=${ACCOUNT:-meridian-mainnet-deployer}
CAP_ACCOUNT=${CAP_ACCOUNT:-100}   # max Cross wallet per account
CAP_TOTAL=${CAP_TOTAL:-1000}      # all Cross wallets together
OI=${OI:-500}                     # max open interest per side, TSLA
TSLA=0x322f0929c4625ed5bad873c95208d54e1c003b2d
export MAINNET_ACK=I_UNDERSTAND_UNAUDITED_MAINNET
mask() { sed -E 's#https?://[^ ]*#<rpc>#g'; }

[ "$(cast chain-id --rpc-url "$RPC")" = 4663 ] || { echo "RPC is not mainnet 4663"; exit 1; }
FROM=$(cast wallet address --account "$ACCOUNT")
echo "gas payer $FROM  balance $(cast balance "$FROM" --ether --rpc-url "$RPC") ETH"
[ "$(echo "$FROM" | tr A-F a-f)" = 0x84811fa225461c24285e16f331ec942ac9a1c199 ] && \
  echo "WARNING: exposed key — only pays gas here (no roles), but its ETH can be swept at any time."

if ! grep -q CrossMarginAccount deployments/4663.json; then
  cp deployments/4663.json /tmp/4663.json.bak
  echo; echo "== simulation =="
  forge script script/DeployCrossMainnet.s.sol --rpc-url "$RPC" --sender "$FROM" 2>&1 | mask \
    | grep -E "Error|revert|Estimated|InsuranceFund|CrossMarginAccount|CrossOptionBook"
  cp /tmp/4663.json.bak deployments/4663.json; rm -rf broadcast/DeployCrossMainnet.s.sol/4663/dry-run
  read -r -p "Broadcast to MAINNET? type yes: " ok; [ "$ok" = yes ] || exit 1
  forge script script/DeployCrossMainnet.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --sender "$FROM" --broadcast --slow 2>&1 \
    | mask | grep -vi private | grep -vE "Just a moment|etherscan: Failed"
fi

J=deployments/4663.json
CROSS=$(python3 -c "import json;print(json.load(open('$J'))['CrossMarginAccount'])")
BOOK=$(python3 -c "import json;print(json.load(open('$J'))['CrossOptionBook'])")
FUND=$(python3 -c "import json;print(json.load(open('$J'))['InsuranceFund'])")
POOL=$(python3 -c "import json;print(json.load(open('$J'))['LiquidityPool'])")
SAFE=$(python3 -c "import json;print(json.load(open('$J'))['admin'])")
[ "$(cast call "$CROSS" 'hasRole(bytes32,address)(bool)' 0x0000000000000000000000000000000000000000000000000000000000000000 "$SAFE" --rpc-url "$RPC")" = true ] \
  || { echo "Safe is not admin of Cross — stop"; exit 1; }

U=1000000
FUNDING=$((100000000000000000 / 31536000))   # 10%/yr in 1e18/s
C1=$(cast calldata "grantRole(bytes32,address)" "$(cast keccak COVER_ROLE)" "$CROSS")
C2=$(cast calldata "setOptionBook(address)" "$BOOK")
C3=$(cast calldata "grantRole(bytes32,address)" "$(cast keccak ENGINE_ROLE)" "$CROSS")
C4=$(cast calldata "configureMarket(address,(uint128,uint128,uint64,uint16,uint16,bool,bool))" \
  $TSLA "($((OI * U)),$((OI * U)),$FUNDING,10,10,false,false)")
C5=$(cast calldata "setCaps(uint256,uint256)" $((CAP_ACCOUNT * U)) $((CAP_TOTAL * U)))

OUT=script/mainnet/batches/05-enable-cross.json
python3 - "$OUT" <<PY
import json, sys
tx = lambda to, data, d: {"to": to, "value": "0", "data": data, "description": d}
json.dump({"version": "1.0", "chainId": "4663", "meta": {"name": "Meridian: enable Common Ledger (Cross)"},
  "transactions": [
    tx("$FUND", "$C1", "InsuranceFund.grantRole(COVER_ROLE, Cross)"),
    tx("$CROSS", "$C2", "Cross.setOptionBook($BOOK)"),
    tx("$POOL", "$C3", "LiquidityPool.grantRole(ENGINE_ROLE, Cross)"),
    tx("$CROSS", "$C4", "Cross.configureMarket(TSLA, OI $OI/side, fee 0.10%, funding 10%/yr)"),
    tx("$CROSS", "$C5", "Cross.setCaps($CAP_ACCOUNT per account, $CAP_TOTAL total USDG)"),
  ]}, open(sys.argv[1], "w"), indent=2)
PY
echo; echo "Cross $CROSS | Book $BOOK | IF $FUND"
echo "Batch written: $OUT"
echo "Next: bash script/mainnet/safe-exec-batch.sh $OUT"
echo "Then: cd ../apps/web && node scripts/sync-deployments.mjs   (set CROSS start block in cross.tsx + keeper)"
