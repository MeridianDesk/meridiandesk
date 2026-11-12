import type { Metadata } from "next";
import Link from "next/link";
import { app, legal, risk } from "@/content/copy";
import { VMark } from "@/components/home/parts";
import { CHAIN_EXPLORER, registry, REGISTRY_SNAPSHOT, sectors } from "@/content/registry";

export const metadata: Metadata = {
  title: "Docs — Meridian Desk",
  description: "How Meridian Desk Perps and Options work on Robinhood Chain: leverage cap, liquidation, oracles, catalog and launch status.",
};

/* Docs copy is new (outside §17.7) — Draft copy. Facts follow the spec. */

const toc = [
  ["overview", "Overview"],
  ["status", "Launch status"],
  ["perps", "Perps"],
  ["leverage", "Leverage & liquidation"],
  ["options", "Options"],
  ["catalog", "Market catalog"],
  ["oracle", "Oracles & sessions"],
  ["execution", "Execution & latency"],
  ["risk", "Risks"],
  ["legal", "Affiliation & legal"],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-10 font-zal text-[24px] font-semibold tracking-[-0.025em] text-ivory first:border-0 first:pt-0">
      <a href={`#${id}`} className="hover:text-dawn">{children}</a>
    </h2>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="font-inter text-[15px] leading-[1.7] text-haze">{children}</p>;
const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-[3px] border border-white/15 px-1.5 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.06em] text-ivory/80">{children}</span>
);

function Spec({ rows }: { rows: [string, React.ReactNode, ("final" | "proposed")?][] }) {
  return (
    <dl className="overflow-hidden rounded-[8px] border border-white/[0.08]">
      {rows.map(([k, v, s], i) => (
        <div key={k} className={`grid gap-1 bg-char px-4 py-3 sm:grid-cols-[200px_1fr] ${i ? "border-t border-white/[0.06]" : ""}`}>
          <dt className="font-plex text-[11.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
          <dd className="flex flex-wrap items-center gap-2 font-inter text-[14px] text-ivory">
            {v}
            {s === "proposed" ? <span className="font-plex text-[10.5px] text-dawn">PROPOSED · final in risk design</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function DocsPage() {
  const withOracle = registry.filter((m) => m.oracle).length;
  return (
    <div className="min-h-dvh bg-void text-ivory">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-void/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <VMark size={20} />
            <span className="font-inter text-[17px] font-medium tracking-[-0.03em]">Meridian</span>
            <span className="font-inter text-[12px] text-haze">Docs</span>
          </Link>
          <nav aria-label="Docs" className="ml-auto flex items-center gap-1">
            <Link href="/app/perps" className="h-9 px-3 font-inter text-[13.5px] leading-9 text-haze hover:text-ivory">Perps</Link>
            <Link href="/app/options" className="h-9 px-3 font-inter text-[13.5px] leading-9 text-haze hover:text-ivory">Options</Link>
            <Link href="/app" className="h-9 rounded-[4px] bg-dawn px-4 font-inter text-[13.5px] leading-9 text-void hover:bg-dawn-hi">Open app</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 font-plex text-[11px] uppercase tracking-[0.14em] text-smoke">On this page</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 lg:block lg:space-y-1.5">
            {toc.map(([id, l]) => (
              <li key={id}><a href={`#${id}`} className="font-inter text-[13.5px] text-haze hover:text-ivory">{l}</a></li>
            ))}
          </ul>
        </aside>

        <article className="max-w-[760px] space-y-6">
          <div className="space-y-4 pb-4">
            <p className="font-plex text-[11.5px] uppercase tracking-[0.16em] text-dawn">Documentation · v0 draft</p>
            <h1 className="font-zal text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[44px]">How Meridian Desk works</h1>
          </div>

          <H2 id="overview">Overview</H2>
          <P>
            Meridian Desk is a derivatives desk for Robinhood Stock Tokens on Robinhood Chain (chain ID 4663). It has two
            products: <strong className="text-ivory">Perps</strong> for leveraged long or short exposure, and{" "}
            <strong className="text-ivory">Options</strong> for calls and puts. They are separate products with separate
            navigation, risk engines and positions. They are never merged into a single button or blended account.
          </P>
          <P>Both desks list the same full catalog of Stock Tokens, and every collateral, premium and settlement amount is in USDG.</P>

          <H2 id="status">Launch status</H2>
          <Spec
            rows={[
              ["Perps engine", <Tag key="p">Live</Tag>],
              ["Options engine", <Tag key="o">Live</Tag>],
              ["Catalog", `${registry.length} Stock Tokens · snapshot ${REGISTRY_SNAPSHOT}`],
              ["Audit", "Unaudited. Mainnet launches as a guarded beta, with an audit running in parallel"],
              ["Guardrails at launch", "Deposit caps, asset allowlist, per-market pause, multisig administration"],
            ]}
          />
          <P>Prices, balances and estimates come straight from on-chain oracles and contracts. A market without an oracle feed shows an em dash (—). Meridian never shows synthetic prices.</P>

          <H2 id="perps">Perps</H2>
          <Spec
            rows={[
              ["Underlying", "Every Stock Token in the catalog"],
              ["Margin & quote", "USDG"],
              ["Leverage", app.leverageOptions.join(" · ")],
              ["Order types", "Market, limit. Stop orders planned for v1.1"],
              ["Margin mode", "Isolated", "proposed"],
              ["Funding", "Periodic funding rate. Parameters will be published here before testnet", "proposed"],
              ["Liquidation", "Maintenance margin based", "proposed"],
            ]}
          />
          <P>Order size can be entered in USDG notional, and the token amount is shown next to it. Before you submit, the ticket previews margin required, the estimated liquidation price and fees.</P>

          <H2 id="leverage">Leverage & liquidation</H2>
          <P>
            Leverage has exactly four settings: 1×, 1.25×, 1.5× and 2×. There is no slider and no free input. The 2× cap is
            enforced twice, once in the interface and again in the smart contracts, so no client can open a position above 2×.
          </P>
          <div className="rounded-[8px] border border-dawn/25 bg-dawn/[0.05] px-4 py-3 font-inter text-[14.5px] text-dawn-hi" role="note">
            {app.liqWarning}. A position at 1× or 2× can still be liquidated if its margin falls below the maintenance level.
          </div>
          <P>Out of scope for v1: leverage above 2×, power perps, using Stock Tokens as margin (phase 2) and portfolio margin.</P>

          <H2 id="options">Options</H2>
          <Spec
            rows={[
              ["Style", "European call and put, buy-to-open"],
              ["Settlement", "Cash-settled in USDG against the oracle mark at expiry"],
              ["Expiries", "Presets: 1D · 1W · 1M", "proposed"],
              ["Strikes", "Grid relative to ATM", "proposed"],
              ["Premium", "Paid in USDG. Buyers can lose at most the premium they paid"],
              ["Underlying", "Same full catalog as Perps"],
            ]}
          />
          <P>Covered calls may arrive in phase 1.5. American exercise, exotics and a full Wall Street chain are out of scope for v1.</P>

          <H2 id="catalog">Market catalog</H2>
          <P>
            The app lists every supported Stock Token with no hidden subset. Every row shows the live Stock Token price
            from the Robinhood Stock Token API. Markets open for trading on a desk carry a <Tag>Live</Tag> badge. Filters only
            narrow the view you asked for. Resetting them always brings back 100% of the catalog.
          </P>
          <Spec
            rows={[
              ["Stock Tokens", String(registry.length)],
              ["With a published Chainlink feed", `${withOracle} of ${registry.length}`],
              ["Sectors (UI grouping)", sectors.join(" · ")],
              ["Registry fields", "Token address, symbol, oracle, perpsEnabled, optionsEnabled, decimals, metadata URI"],
            ]}
          />
          <P>
            The featured row on the landing page is a curated preview only. The source of truth is MarketRegistry, which will
            be synced from the Robinhood Chain asset registry. Token contracts can be verified on the{" "}
            <a className="text-dawn hover:text-dawn-hi" href={CHAIN_EXPLORER} target="_blank" rel="noreferrer">Robinhood Chain explorer</a>.
          </P>

          <H2 id="oracle">Oracles & sessions</H2>
          <P>
            Marks come from the official Chainlink feeds for Stock Tokens on Robinhood Chain. These feeds follow US equities
            market hours (24/5). Stock Tokens can move on chain while the underlying market is closed, so prices can gap
            across weekends, holidays and session changes.
          </P>
          <P>When a feed is stale or missing, new orders on that market are blocked.</P>

          <H2 id="execution">Execution & latency</H2>
          <P>{legal.denimExplainer}</P>
          <P>
            The order ticket shows a confirmation chip. After an order confirms it reads <Tag>Confirm ~XXms</Tag> with
            the measured time. Before that it reads <Tag>{app.softConfirm}</Tag>. Robinhood Chain produces a block about every 0.1 s,
            twice the cadence of the 0.2 s blocks Base introduced with Denim.
          </P>

          <H2 id="risk">Risks</H2>
          <ul className="space-y-3">
            {risk.body.map((b) => (
              <li key={b} className="flex gap-3 font-inter text-[15px] leading-[1.7] text-haze">
                <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-dawn" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
          <P>{risk.footnote}</P>

          <H2 id="legal">Affiliation & legal</H2>
          <P>{legal.affiliation}</P>
          <P>{legal.disclaimer}</P>
        </article>
      </div>
    </div>
  );
}
