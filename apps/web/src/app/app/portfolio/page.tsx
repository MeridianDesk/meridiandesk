import Link from "next/link";
import { appUi } from "@/content/copy";
import { LivePositions, PoolPanel } from "@/components/desk/live";

export const metadata = { title: "Portfolio — Meridian Desk" };

function Block({ title, desk }: { title: string; desk: "perps" | "options" }) {
  return (
    <section aria-label={title} className="rounded-[8px] border border-white/[0.08] bg-char">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <h2 className="font-zal text-[15px] font-semibold tracking-[-0.01em] text-ivory">{title}</h2>
        <Link href={`/app/${desk}`} className="font-inter text-[12.5px] text-dawn hover:text-dawn-hi">Open desk →</Link>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/[0.05] md:grid-cols-4">
        {(desk === "perps" ? ["Equity", "Unrealized PnL", "Margin used", "Open positions"] : ["Premium paid", "Mark value", "Open contracts", "Next expiry"]).map((k) => (
          <div key={k} className="bg-char px-5 py-4">
            <dt className="font-plex text-[10.5px] uppercase tracking-[0.08em] text-smoke">{k}</dt>
            <dd className="mt-1 font-plex text-[16px] text-ivory/70">—</dd>
          </div>
        ))}
      </dl>
      {desk === "perps" ? <LivePositions /> : null}
      <p className="px-5 py-6 font-inter text-[13px] text-haze">{appUi.portfolioEmpty}</p>
    </section>
  );
}

export default function Portfolio() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-10 md:px-6">
      <div>
        <h1 className="font-zal text-[28px] font-semibold tracking-[-0.025em] text-ivory">Portfolio</h1>
        <p className="mt-1 font-inter text-[14px] text-haze">Perps and Options are separate products with separate risk. They are shown separately here too.</p>
      </div>
      <Block title="Perps" desk="perps" />
      <Block title="Options" desk="options" />
      <PoolPanel />
    </div>
  );
}
