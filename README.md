<p align="center"><img src=".github/banner.png" alt="Meridian Desk" width="100%"></p>

# Meridian Desk

Perps and options on Stock Tokens, on Robinhood Chain. Two desks share one catalog, and you can keep each position isolated or put them on a Common Ledger (cross margin).

Live at https://meridiandesk.tech

> Unaudited beta. The contracts have **not** had an external audit. Mainnet runs under guarded caps. Only use funds you can afford to lose. See [SECURITY.md](SECURITY.md).

## What's inside

    contracts/   Foundry: registry, oracle router, LP vault, perps, options, cross margin, insurance fund
    apps/web/    Next.js 15 desk (wagmi/viem), landing, docs, trading UI
    keeper/      Node keeper: isolated + cross liquidations, option settlement, testnet price mirror
    docs/adr/    Risk-model decisions (ADR-001 isolated, ADR-002 cross margin)

## Design in short

- Perps: isolated margin, leverage 1× / 1.25× / 1.5× / 2× (hard cap), Chainlink-priced. Counterparty is the USDG LP vault.
- Options: buy-to-open calls and puts, cash-settled at expiry, priced with EIP-712 signed RFQ quotes.
- Common Ledger (cross): one USDG wallet backs perps and long options together. Equity = wallet + perps uPnL + 80% of long-option value. An account can be liquidated once its margin ratio reaches 100%. When oracles go stale, liquidations pause. The insurance fund absorbs any deficit.
- Admin is a Safe multisig. Every parameter change goes through a reviewed batch (`contracts/script/mainnet/batches/`).

## Deployments — Robinhood Chain mainnet (4663)

| Contract | Address |
|---|---|
| MarketRegistry | `0x98d814FF6f36E961CBF1b40af1bec146164AE347` |
| OracleRouter | `0xB739878Be957dEeaeB836D4A05A63b22A08D98Be` |
| LiquidityPool | `0xa7BC06622a45612d41066039d050618A2b4D8E9f` |
| PerpsEngine | `0xf6b07174CD2244D928e9e012D4703B3984712B6A` |
| OptionsEngine | `0xDC44F3e91B782584eEd60D1e3E57F3638217aA21` |
| CrossMarginAccount | `0x9985AfB0A32AE4bAc99f343c5D9AD75159e76A76` |
| CrossOptionBook | `0x51b9192e15BA39b1Ad390F4F5288FD8c8EB84AfA` |
| InsuranceFund | `0x762cAB17435f54f9c5848B04a45F8aBe639BF8e8` |
| Admin (Safe) | `0xeEa7FA2dD4CA77DD230ca4A41eB46ec8A3D89D38` |

The full set, including testnet 46630, is in `contracts/deployments/`.

## Run it

Contracts:

    cd contracts
    forge install          # forge-std, openzeppelin-contracts
    forge build && forge test

Web (testnet):

    cd apps/web
    npm install
    NEXT_PUBLIC_CHAIN_ID=46630 npm run dev

Keeper (copy `.env.example` to `.env` and fill it in locally):

    cd keeper
    npm install
    node keeper.mjs --once --chain=46630     # dry run
    node keeper.mjs --live --chain=46630

Use a dedicated key for the keeper, and never commit `.env` files.

## License

[MIT](LICENSE)
