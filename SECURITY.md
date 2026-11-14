# Security

Meridian Desk is **unaudited beta** software. Mainnet runs with conservative deposit and open-interest caps, admin sits behind a Safe multisig, and a guardian can pause.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private advisory instead: Security → Report a vulnerability on this repository. Include a description, impact, and a proof of concept if you can.

## Scope

- `contracts/src/**` deployed on Robinhood Chain mainnet (addresses in README)
- Keeper and web app, where an issue can lead to loss of user funds
