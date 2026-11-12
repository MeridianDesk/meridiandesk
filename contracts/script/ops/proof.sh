#!/usr/bin/env bash
# Read-only live proof that Meridian Desk contracts are deployed and wired.
# Usage: bash script/ops/proof.sh mainnet|testnet
# Public RPC only, no keys, no writes. Every value below is read from chain at run time.
set -euo pipefail
cd "$(dirname "$0")/../.."

NET=${1:-mainnet}
if [ "$NET" = mainnet ]; then
  CHAIN=4663; RPC=${RPC:-https://robinhood-rpc.publicnode.com}; EXP=https://robinhoodchain.blockscout.com
  DEP=deployments/4663.json; RUNS="broadcast/Deploy.s.sol/4663/run-latest.json"
else
  CHAIN=46630; RPC=${RPC:-https://robinhood-sepolia-rpc.publicnode.com}; EXP=https://explorer.testnet.chain.robinhood.com
  DEP=deployments/46630.json; RUNS="broadcast/DeployTestnet.s.sol/46630/run-latest.json broadcast/SetupTestnet.s.sol/46630/run-latest.json"
fi
j() { python3 -c "import json,sys;print(json.load(open('$DEP'))['$1'])"; }
REG=$(j MarketRegistry); ORC=$(j OracleRouter); POOL=$(j LiquidityPool); PERP=$(j PerpsEngine); OPT=$(j OptionsEngine); USDG=$(j usdg)

c() { cast call --rpc-url "$RPC" "$@" | awk '{print $1}'; }
say() { printf '$ %s\n' "$*"; }
sec() { printf '\n## %s\n' "$*"; }
ok() { [ "$1" = true ] && echo "true  ✓" || echo "false"; }
fmt6() { python3 -c "print(f'{int(\"$1\")/1e6:,.2f}')"; }

echo "MERIDIAN DESK :: on-chain proof :: $NET"
echo "rpc $RPC  ::  read-only, no keys"

sec "network"
say "cast chain-id"; cast chain-id --rpc-url "$RPC"
HEAD=$(cast block-number --rpc-url "$RPC")
say "cast block-number"; echo "$HEAD"
T1=$(cast block "$HEAD" --field timestamp --rpc-url "$RPC"); T0=$(cast block $((HEAD-20000)) --field timestamp --rpc-url "$RPC")
say "avg block time over last 20000 blocks"
python3 -c "print(f'{($T1-$T0)*1000/20000:.0f} ms / block')"

sec "bytecode"
for n in MarketRegistry OracleRouter LiquidityPool PerpsEngine OptionsEngine; do
  a=$(j $n); printf '%-15s %s  %6s bytes\n' "$n" "$a" "$(cast codesize "$a" --rpc-url "$RPC")"
done
if [ "$NET" = testnet ]; then
  python3 -c "
import json;d=json.load(open('deployments/listed.46630.json'))
for s in ('TSLA','AMZN'): print(s, d[s]['feed'])" | while read -r s f; do
    printf '%-15s %s  %6s bytes\n' "Feed $s" "$f" "$(cast codesize "$f" --rpc-url "$RPC")"
  done
fi

sec "deploy receipts"
say "cast receipt <tx> status   # every tx of the deploy broadcast"
TOTAL=0; GOOD=0
for f in $RUNS; do
  while read -r h name; do
    s=$(cast receipt "$h" status --rpc-url "$RPC"); TOTAL=$((TOTAL+1)); [ "$s" = "true" -o "$s" = "1" ] && GOOD=$((GOOD+1))
    [ "$name" = - ] && name="config tx"; [ "$name" = MockERC20 ] && name="tUSDG token"; printf '%s  %-14s %s\n' "${h:0:18}…${h: -6}" "$name" "$( [ "$s" = true ] && echo 'success ✓' || echo "status $s")"
  done < <(python3 -c "
import json;d=json.load(open('$f'))
for t in d['transactions']: print(t['hash'], t['contractName'] if t['transactionType']=='CREATE' else '-')")
done
echo "$GOOD/$TOTAL transactions confirmed on-chain"

ADMIN=0x0000000000000000000000000000000000000000000000000000000000000000
if [ "$NET" = mainnet ]; then
  SAFE=$(j admin)
  sec "governance"
  say "cast call $SAFE 'getThreshold()(uint256)'"
  echo "$(c "$SAFE" 'getThreshold()(uint256)') of $(cast call --rpc-url "$RPC" "$SAFE" 'getOwners()(address[])' | tr ',' '\n' | grep -c 0x) signers (Safe multisig)"
  say "hasRole(DEFAULT_ADMIN, Safe)"
  for n in MarketRegistry LiquidityPool PerpsEngine OptionsEngine; do
    printf '%-15s %s\n' "$n" "$(ok "$(c "$(j $n)" 'hasRole(bytes32,address)(bool)' $ADMIN "$SAFE")")"
  done
fi

sec "wiring"
say "cast call $POOL 'asset()(address)'"; A=$(c "$POOL" 'asset()(address)'); echo "$A  $(c "$A" 'symbol()(string)' 2>/dev/null || cast call --rpc-url "$RPC" "$A" 'symbol()(string)')"
ENG=$(cast keccak ENGINE_ROLE)
printf 'pool ENGINE_ROLE  PerpsEngine   %s\n' "$(ok "$(c "$POOL" 'hasRole(bytes32,address)(bool)' "$ENG" "$PERP")")"
printf 'pool ENGINE_ROLE  OptionsEngine %s\n' "$(ok "$(c "$POOL" 'hasRole(bytes32,address)(bool)' "$ENG" "$OPT")")"
printf 'perps.registry() == MarketRegistry %s\n' "$( [ "$(c "$PERP" 'registry()(address)')" = "$REG" ] && echo 'true  ✓' || echo false)"
printf 'options.oracle() == OracleRouter   %s\n' "$( [ "$(c "$OPT" 'oracle()(address)')" = "$ORC" ] && echo 'true  ✓' || echo false)"
if [ "$NET" = mainnet ]; then
  Q=0x558e58aE6DfA7C3a10b612A21d2b7025c04EC885
  printf 'options QUOTER_ROLE (signing key) %s\n' "$(ok "$(c "$OPT" 'hasRole(bytes32,address)(bool)' "$(cast keccak QUOTER_ROLE)" "$Q")")"
  say "cast call $POOL 'depositCap()(uint256)'"; echo "$(fmt6 "$(c "$POOL" 'depositCap()(uint256)')") USDG pool cap"
fi

if [ "$NET" = testnet ]; then
  sec "markets"
  say "cast call $REG 'marketCount()(uint256)'"; c "$REG" 'marketCount()(uint256)'
  python3 -c "
import json;d=json.load(open('deployments/listed.46630.json'))
for s in ('TSLA','AMZN'): print(s, d[s]['token'])" | while read -r s t; do
    P=$(cast call --rpc-url "$RPC" "$ORC" 'price(address)(uint256,uint256)' "$t" | head -1 | awk '{print $1}')
    printf '%-5s perps %s  oracle mark %s USD\n' "$s" "$(ok "$(c "$REG" 'isPerpsEnabled(address)(bool)' "$t")")" "$(python3 -c "print(f'{int(\"$P\")/1e18:,.2f}')")"
  done
  sec "liquidity"
  say "cast call $POOL 'totalAssets()(uint256)'"; echo "$(fmt6 "$(c "$POOL" 'totalAssets()(uint256)')") tUSDG in pool"
  sec "trades"
  say "cast call $PERP 'nextPositionId()(uint256)'"; N=$(c "$PERP" 'nextPositionId()(uint256)'); echo "$((N-1)) positions opened"
  for h in 0xf29d5fa7f16ed2de732493290bf768f6da4e0dbc7b4572f5820d5d1eeb09d182 0x5c88768d4302ff431ab2ccf1e5c1fa4e29115c2fe0f52d30789e0b218702245c; do
    printf 'open TSLA long  %s…%s  block %s  %s\n' "${h:0:18}" "${h: -6}" "$(cast receipt "$h" blockNumber --rpc-url "$RPC")" "$( [ "$(cast receipt "$h" status --rpc-url "$RPC")" = true ] && echo 'success ✓' || echo failed)"
  done
fi

sec "verify yourself"
for n in PerpsEngine OptionsEngine LiquidityPool; do echo "$EXP/address/$(j $n)"; done
[ "$NET" = mainnet ] && echo "$EXP/address/$(j admin)"
echo
echo "LIVE :: $NET :: chain $CHAIN :: $GOOD/$TOTAL confirmed"
