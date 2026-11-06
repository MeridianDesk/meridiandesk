# Meridian Desk — contracts

Foundry project. solc 0.8.24, OpenZeppelin 5, via-IR. Design and parameters are in
../docs/adr/ADR-001-risk-model.md.

    src/MarketRegistry.sol   full Stock Token catalog + Chainlink proxy + desk flags
    src/OracleRouter.sol     Chainlink → 1e18, stale guard, expiry-round proof
    src/LiquidityPool.sol    ERC-4626 USDG LP vault, reservations, caps, pause
    src/PerpsEngine.sol      isolated perps, leverage 1× / 1.25× / 1.5× / 2× (hard cap)
    src/OptionsEngine.sol    buy-to-open, cash-settled at expiry, EIP-712 RFQ quotes
    script/Deploy.s.sol      deploy + guarded caps + hand roles to the multisig
    script/ListMarkets.s.sol list deployments/markets.<chainId>.json (all markets, desks disabled)

## Commands

    forge build
    forge test                                        # unit + fuzz + invariant
    RH_FORK_RPC=https://robinhood.drpc.org forge test --mt Fork -vv   # real 4663 feeds, read-only

Local dry run:

    anvil --port 8547
    forge create test/mocks/Mocks.sol:MockERC20 --constructor-args USDG USDG 6 --broadcast ...
    USDG=<mock> ADMIN=<safe> forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 --broadcast ...

Testnet (46630). Use --sender to dry-run first, then broadcast with the key from .env. Never print
the key. If the ISP blocks *.robinhood.com, verify via Sourcify:

    forge verify-contract <addr> src/PerpsEngine.sol:PerpsEngine --verifier sourcify --chain 46630 --watch

Low leverage does not remove liquidation risk. Max leverage is 2×.
