/**
 * Meridian Desk — canonical copy deck (spec §17).
 * Treat as spec. Change only with maintainer approval.
 * Forbidden phrases (never ship): "Powered by Denim", "Built on Denim",
 * "Meridian is Denim on Robinhood", "Official Base Denim partner", "Denim connected".
 */

export const brand = {
  name: "Meridian Desk",
  short: "Meridian",
  chainLine: "On Robinhood Chain",
  chainId: 4663,
} as const;

export const nav = {
  landing: [
    { label: "Perps", href: "#desks" },
    { label: "Options", href: "#desks" },
    { label: "Markets", href: "#markets" },
    { label: "Risk", href: "#risk" },
    { label: "Docs", href: "/docs" },
  ],
  app: ["Perps", "Options", "Portfolio", "Docs"],
} as const;

export const hero = {
  eyebrow: "Stock Token derivatives desk · Robinhood Chain",
  // §17.3 headline option 1 (primary)
  headlineA: "Stock Token Perps and Options.",
  headlineB: "One premium desk.",
  // §17.3 subhead option 1
  subhead:
    "Denim-grade execution on Robinhood Chain. Leverage capped at 2×. Full market catalog.",
  primaryCta: "Launch App",
  secondaryCta: "View Markets",
  tertiaryCta: "Read Docs",
  microLine: "Unaudited beta",
} as const;

export const proof = {
  label: "Featured Stock Tokens",
  differentiators: ["Max 2× leverage", "Full catalog in app", "Measured latency"],
} as const;

export const desks = {
  perps: {
    tag: "Desk A",
    title: "Perps",
    blurb: "Leveraged long/short on Stock Tokens. Max 2×.",
    specs: [
      ["Leverage", "1× · 1.25× · 1.5× · 2×"],
      ["Margin", "USDG"],
      ["Orders", "Market (oracle price)"],
      ["Mode", "Isolated (v1)"],
    ],
  },
  options: {
    tag: "Desk B",
    title: "Options",
    blurb: "Calls and puts on the same catalog. Separate from perps.",
    specs: [
      ["Style", "European, cash-settled"],
      ["Premium", "USDG"],
      ["Expiry", "Preset ladder"],
      ["Positions", "Buy-to-open (v1)"],
    ],
  },
} as const;

export const markets = {
  title: "Featured Stock Tokens",
  sub: "Famous names here. Every supported Stock Token in the app — no subset, no exceptions.",
  link: "See all markets in app",
} as const;

export const why = {
  title: "Why Meridian",
  items: [
    {
      k: "01",
      title: "Two desks, not one button.",
      body: "Perps and Options run as separate products — separate navigation, risk engine and positions.",
    },
    {
      k: "02",
      title: "Leverage capped at 2×.",
      body: "Four settings only: 1×, 1.25×, 1.5×, 2×. Enforced in the interface and in the contracts.",
    },
    {
      k: "03",
      title: "Denim-grade, measured execution.",
      body: "Confirmation time is shown on every order. We publish the number instead of promising it.",
    },
  ],
} as const;

export const latency = {
  title: "Execution you can read.",
  sub: "Denim-grade is our UX bar for speed and clarity. Reference points below are narrative benchmarks, not claims about any host chain.",
  rows: [
    { label: "Classic L2 confirmation", value: "1–2 s", ms: 1500, note: "Typical era benchmark" },
    { label: "Denim-era block time", value: "0.2 s", ms: 200, note: "Narrative reference" },
    { label: "Robinhood Chain block", value: "~0.1 s", ms: 100, note: "Per RH documentation" },
  ],
  meridianRow: {
    label: "Meridian order confirm",
    value: "Shown live",
    note: "Measured per order in app",
  },
  chip: "Confirm ~ms · live",
} as const;

// Draft copy — heavy "Denim-grade execution" section (benchmark framing only, no affiliation claim)
export const execLive = {
  kicker: "Denim-grade execution",
  title: "Built to the Denim-grade bar.",
  titleB: "Measured on Robinhood Chain.",
  sub: "Base's Denim upgrade set a new bar for onchain speed: 200 ms blocks. Meridian holds itself to that bar on Robinhood Chain, where blocks land around every 100 ms. We don't ask you to trust the number. The meter below reads the chain live.",
  meterTitle: "Robinhood Chain mainnet · live",
  live: "Live",
  offline: "RPC unavailable",
  blockTime: "Avg block",
  height: "Block height",
  rtt: "RPC round-trip",
  meterNote: "Read directly from a public Robinhood Chain RPC in your browser. Avg block = blocks produced since you opened this page. Round-trip depends on your network.",
  flowTitle: "From click to receipt",
  flow: [
    { k: "01", title: "Sign", body: "One signature. Leverage, size and fees are fixed before you sign." },
    { k: "02", title: "Soft-confirm", body: "The sequencer accepts the order in milliseconds. The ticket shows it at once." },
    { k: "03", title: "Oracle mark", body: "Fill at the Chainlink mark, checked for staleness on-chain." },
    { k: "04", title: "Receipt", body: "Final receipt with confirm time and an explorer link. Every order." },
  ],
  benchTitle: "Block time, side by side",
  footnote: "Denim is a Base network upgrade. Meridian runs on Robinhood Chain, not Base, and is not affiliated with, endorsed by, or partnered with Base or Denim. \"Denim-grade\" describes our execution bar only.",
} as const;

export const how = {
  title: "How it works",
  steps: [
    { k: "1", title: "Connect", body: "Connect a Robinhood Chain wallet and deposit USDG." },
    { k: "2", title: "Choose Perps or Options", body: "Two desks, two engines. Pick the one that fits your view." },
    { k: "3", title: "Trade from the full catalog", body: "Every supported Stock Token, searchable and filterable." },
  ],
} as const;

export const risk = {
  title: "Risk, stated plainly.",
  body: [
    "Stock Tokens trade 24/7 while underlying markets do not. Prices can gap across weekends, holidays and session changes, and oracle updates follow official feeds.",
    "Low leverage does not remove liquidation risk. A 2× position can still be liquidated.",
    "Meridian Desk is an unaudited beta under guarded launch: deposit caps, market pauses and multisig administration apply.",
  ],
  footnote: "Not investment advice. No returns are promised.",
} as const;

export const manifesto = {
  lead: "Leverage is a tool, not a thrill.",
  payoff: "Meridian caps it at 2× — in the interface and in the contracts.",
} as const;

export const app = {
  leverageOptions: ["1×", "1.25×", "1.5×", "2×"] as const,
  leverageHelper: "Max leverage 2×",
  optionsEmpty: "Select a Stock Token to view strikes",
  searchEmpty: "No markets match — try another symbol",
  badgeComingSoon: "Coming soon",
  badgeOracle: "Oracle unavailable",
  latencyChip: (ms: number) => `Confirm ~${ms}ms`,
  softConfirm: "Soft-confirm",
  liqWarning: "Low leverage does not remove liquidation risk",
} as const;

/**
 * In-app strings beyond §17.7. Draft copy — new copy, not from the brief.
 */
export const appUi = {
  connect: "Connect wallet",
  connectNote: "Wallet connection opens with the guarded testnet.",
  preTestnet: "Engine pre-testnet",
  preTestnetNote: "Orders open when this desk reaches guarded testnet. Nothing here executes yet.",
  catalogTitle: "All Stock Tokens",
  catalogCount: (shown: number, total: number) => `${shown} of ${total}`,
  searchPlaceholder: "Search symbol or name",
  oracleStream: "Oracle stream not connected",
  chartEmpty: "Chart appears when the oracle stream is connected. No synthetic price data is shown.",
  newlyListedEmpty: "Listing dates arrive with the registry sync. Nothing is hidden — clear this filter to see every market.",
  registryNote: (date: string) => `Registry snapshot ${date} · every supported Stock Token, no subset`,
  portfolioEmpty: "Connect a wallet to see positions. Perps and Options positions are tracked separately.",
  sessionNote: "Oracle feeds follow US equities 24/5 market hours. Expect gaps across weekends and holidays.",
  optionsBuyOnly: "Buy-to-open only in v1",
} as const;

/** Draft copy — wallet connect. */
export const wallet = {
  title: "Connect a wallet",
  account: "Wallet",
  close: "Close",
  browserWallet: "Browser wallet",
  confirmInWallet: "Confirm in wallet…",
  noWallet: "No browser wallet detected. Install one, then reload:",
  errorPrefix: "Connection failed.",
  footnote: "Meridian never holds your keys. Connecting does not sign or send any transaction.",
  switchTo: "Switch to",
  switchFailed: "Network switch was rejected.",
  phantomUnsupported:
    "Phantom does not support Robinhood Chain as a custom network. Use MetaMask, Rabby or another EVM wallet that can add networks.",
  copy: "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
} as const;

/** Draft copy — testnet trading (46630). */
// Draft copy — market chart (PM revision 2026-11-06)
export const chartUi = {
  title: (s: string, span: string) => `${s} / USD · Chainlink oracle · ${span}`,
  lastRound: "Last round",
  tfLabel: "Candle interval",
  loading: "Loading oracle history…",
  unavailable: "Oracle history unavailable",
  source: (n: number) => `Source: Chainlink feed on Robinhood Chain mainnet, ${n} on-chain rounds grouped into candles. Oracle updates, not a trade tape. US equities trade 24/5 — expect flat weekends.`,
  // Draft copy — TradingView underlying reference for no-feed markets
  tvTitle: (tv: string) => `${tv} · Underlying share · Reference`,
  tvBadge: "Not the token price",
  tvNote: "Exchange price of the underlying share, shown for reference. It is not the Stock Token price and Meridian does not trade off it. Trading stays off until a Chainlink feed is live.",
  tvCredit: "Chart by TradingView",
  tvAria: (s: string, tv: string) => `${s} underlying reference chart, ${tv}, by TradingView`,
  noFeedTitle: "No Chainlink feed yet",
  noFeedBody: "This market has no Chainlink feed on Robinhood Chain yet, so there is no oracle price or chart. Trading stays off until a feed is live.",
  aria: (s: string, n: number) => `${s} oracle price, ${n} Chainlink rounds`,
} as const;

export const testnetDesk = {
  badge: "Testnet",
  illustrative: "Illustrative · testnet mirror of the mainnet Chainlink feed, refreshed manually",
  updated: (ago: string) => `Updated ${ago} ago`,
  stale: "Oracle price is stale — opens and closes are blocked until it refreshes.",
  faucet: "Get 1,000 test USDG",
  faucetNote: "Test token — no value",
  connectToTrade: "Connect a wallet to trade on testnet.",
  wrongChain: "Switch your wallet to Robinhood Chain Testnet to trade.",
  approve: "Approve test USDG",
  approving: "Approving…",
  sending: "Confirm in wallet…",
  range: (min: string, max: string) => `Collateral ${min}–${max} USDG per position`,
  sizeLabel: "Collateral",
  notional: "Position size",
  noPositions: "No open Perps positions.",
  noHistory: "No Perps trades yet.",
  close: "Close",
  closing: "Closing…",
  openedTitle: "Position opened",
  closedTitle: "Position closed",
  poolTitle: "Liquidity pool",
  poolNote: "Shared test-USDG pool. It is the counterparty to every Perps and Options trade, so LPs can lose money when traders win.",
  deposit: "Deposit",
  withdrawAll: "Withdraw all",
  yourShare: "Your deposit",
  poolAssets: "Pool assets",
  freeLiquidity: "Free liquidity",
  utilization: "Utilization",
  failed: "Transaction failed.",
  // Options (testnet quoter)
  optQty: "Quantity",
  optQtyUnit: "units",
  optQuoteNote: "Testnet pricing: Black-Scholes, flat 60% IV. Quote valid 60 s.",
  optNotEnabled: "Options are not enabled for this market on testnet yet.",
  optQuoting: "Fetching quote…",
  optBoughtTitle: "Option bought",
  noOptions: "No open Options positions.",
  noOptHistory: "No Options trades yet.",
  awaitingSettle: "Awaiting settlement",
} as const;

/** Draft copy — tx success popup. */
export const txReceipt = {
  title: "Transaction confirmed",
  hashLabel: "Transaction hash",
  viewOnExplorer: "View on Blockscout",
  copy: "Copy",
  copied: "Copied",
  close: "Close",
  previewNote: "Dev preview — opened from ?txpreview, not from a Meridian order.",
} as const;

/** Draft copy — landing footer contract list. */
export const contractFooter = {
  title: "Contracts",
  note: "Verify every address on Blockscout before interacting.",
  contract: "Contract",
  notDeployed: "Not deployed",
  copy: "Copy",
  copied: "Copied",
  // Draft copy
  testUsdg: "Test token — no value, testnet only",
} as const;

export const legal = {
  denimExplainer:
    "Denim-grade means our execution UX bar (speed + clarity), inspired by Base’s Denim upgrade narrative — Meridian runs on Robinhood Chain, not Base.",
  affiliation:
    "Meridian Desk is not affiliated with, endorsed by, or partnered with Base, Denim, Robinhood Markets or its affiliates, Arcus, or Lighter. Stock Tokens are issued by Robinhood Assets (Jersey) Limited.",
  disclaimer: "Not investment advice. Not an offer to buy or sell any security or token.",
} as const;
