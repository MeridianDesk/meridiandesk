#!/usr/bin/env bash
# Robinhood Chain MAINNET — step 1: fresh keys (the testnet deployer key was exposed, never reuse it).
# Creates an encrypted Foundry keystore for the mainnet deployer. You type the password; the key is never printed.
# Run from contracts/:  bash script/mainnet/1-keys.sh
set -euo pipefail
KS=~/.foundry/keystores
NAME=meridian-mainnet-deployer

if [ -f "$KS/$NAME" ]; then
  echo "Keystore $NAME already exists."
else
  echo "Creating keystore $NAME (choose a NEW password, store it in your password manager)…"
  cast wallet new "$KS" "$NAME"
fi
echo
echo "Deployer address (type the keystore password):"
cast wallet address --account "$NAME"
echo
cat <<'EOF'
Next:
  1. Send ~0.002 ETH on Robinhood Chain mainnet (4663) to the deployer address above.
  2. Options quoter key (server-only, NOT an admin): run   cast wallet new
     Put its private key ONLY in Vercel → Environment Variables → QUOTER_PK (Production).
     Keep the printed address: it becomes QUOTER in step 3.
  3. Send the user the two ADDRESSES (deployer + quoter). Never send private keys or passwords.
EOF
