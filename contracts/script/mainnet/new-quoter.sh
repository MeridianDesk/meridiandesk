#!/usr/bin/env bash
# Create the options QUOTER key without ever showing the private key on screen.
# Prints only the address; the private key goes straight to the macOS clipboard
# so you can paste it into Vercel → Environment Variables → QUOTER_PK (Production).
set -euo pipefail
cast wallet new --json | python3 -c '
import json, subprocess, sys
w = json.load(sys.stdin)["data"][0]
subprocess.run("pbcopy", input=w["private_key"].encode(), check=True)
print("QUOTER address:", w["address"])
print("Private key copied to clipboard -> paste it into Vercel as QUOTER_PK now (do not paste it in chat).")
'
