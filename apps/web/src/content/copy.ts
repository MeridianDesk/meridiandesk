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
      ["Orders", "Market · Limit"],
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

export const legal = {
  denimExplainer:
    "Denim-grade means our execution UX bar (speed + clarity), inspired by Base’s Denim upgrade narrative — Meridian runs on Robinhood Chain, not Base.",
  affiliation:
    "Meridian Desk is not affiliated with, endorsed by, or partnered with Base, Denim, Robinhood Markets or its affiliates, Arcus, or Lighter. Stock Tokens are issued by Robinhood Assets (Jersey) Limited.",
  disclaimer: "Not investment advice. Not an offer to buy or sell any security or token.",
} as const;
