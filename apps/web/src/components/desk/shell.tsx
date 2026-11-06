"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/content/copy";
import { ACTIVE_CHAIN_ID, chains } from "@/content/chain";
import { VMark } from "@/components/home/parts";
import { LatencyChip } from "./bits";
import { WalletButton } from "./wallet";

const tabs = [
  { label: "Perps", href: "/app/perps" },
  { label: "Options", href: "/app/options" },
  { label: "Portfolio", href: "/app/portfolio" },
  { label: "Docs", href: "/docs" },
] as const;

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-void/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-2 px-3 sm:gap-4 md:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Meridian Desk home">
          <VMark size={20} />
          <span className="hidden font-inter text-[17px] font-medium tracking-[-0.03em] text-ivory min-[420px]:inline">{brand.short}</span>
          <span className="hidden font-inter text-[12px] text-haze sm:inline">Desk</span>
        </Link>
        <nav aria-label="App" className="flex min-w-0 items-center gap-0 overflow-x-auto [scrollbar-width:none] sm:ml-2">
          {tabs.map((t) => {
            const on = path?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative h-14 shrink-0 px-2.5 font-inter sm:px-3 text-[14px] leading-[56px] ${on ? "text-ivory" : "text-haze hover:text-ivory"}`}
              >
                {t.label}
                {on ? <span className="absolute inset-x-3 bottom-0 h-[2px] bg-dawn" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 font-plex text-[11px] text-smoke lg:flex">
            {chains[ACTIVE_CHAIN_ID].name} · {ACTIVE_CHAIN_ID}
          </span>
          <span className="hidden md:inline-flex">
            <LatencyChip />
          </span>
          <WalletButton />
        </div>
      </div>
      <div className="border-t border-white/[0.05] bg-char/60">
        <p className="mx-auto max-w-[1480px] px-4 py-1.5 font-plex text-[10.5px] uppercase tracking-[0.1em] text-smoke md:px-6">
          Guarded launch · max leverage 2× · not investment advice
        </p>
      </div>
    </header>
  );
}
