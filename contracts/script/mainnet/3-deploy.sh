#!/usr/bin/env bash
# Robinhood Chain MAINNET — step 3: deploy the Meridian core (Registry, OracleRouter, Pool, Perps, Options).
# All roles go to the Safe, deployer renounces everything, both desks start DISABLED, no market listed yet.
# Usage (from contracts/):
#   DEPLOYER=0x.. ADMIN=0xSafe QUOTER=0x.. [GUARDIAN=0x..] [DEPOSIT_CAP=5000000000] bash script/mainnet/3-deploy.sh
set -euo pipefail
RH_RPC_MAINNET=$(grep "^RH_RPC_MAINNET=" .env | cut -d= -f2-)   # only the RPC; never import testnet ADMIN/USDG/keys
RPC="${RPC:-$RH_RPC_MAINNET}"
ACCOUNT=${ACCOUNT:-meridian-deployer}
: "${DEPLOYER:?}" "${ADMIN:?}" "${QUOTER:?}"
export USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168   # Global Dollar (USDG), 6 decimals
export ADMIN QUOTER GUARDIAN=${GUARDIAN:-} DEPOSIT_CAP=${DEPOSIT_CAP:-5000000000}   # default $5k pool cap
export MAINNET_ACK=I_UNDERSTAND_UNAUDITED_MAINNET ALLOW_EXPOSED_DEPLOYER=true

[ "$(cast chain-id --rpc-url "$RPC")" = 4663 ] || { echo "RPC is not mainnet 4663"; exit 1; }
echo "deployer $DEPLOYER  balance $(cast balance "$DEPLOYER" --ether --rpc-url "$RPC") ETH  nonce $(cast nonce "$DEPLOYER" --rpc-url "$RPC")"
echo "admin    $ADMIN  threshold $(cast call "$ADMIN" 'getThreshold()(uint256)' --rpc-url "$RPC")"
echo "quoter $QUOTER  guardian ${GUARDIAN:-none}  pool cap $((DEPOSIT_CAP / 1000000)) USDG"
[ -f deployments/4663.json ] && { echo "deployments/4663.json exists — already deployed?"; exit 1; }

echo; echo "== simulation =="
forge script script/Deploy.s.sol --rpc-url "$RPC" --sender "$DEPLOYER" 2>&1 \
  | grep -vi private | grep -E "Error|revert|mainnet:|Estimated|Registry|Router|Pool|Engine"
rm -f deployments/4663.json; rm -rf broadcast/Deploy.s.sol/4663/dry-run

read -r -p "Broadcast to MAINNET? type yes: " ok; [ "$ok" = yes ] || exit 1
forge script script/Deploy.s.sol --rpc-url "$RPC" ${SIGNER:---account $ACCOUNT} --sender "$DEPLOYER" --broadcast --slow 2>&1 \
  | grep -vi private | grep -vE "Just a moment|etherscan: Failed"
echo; echo "== deployments/4663.json =="; cat deployments/4663.json
