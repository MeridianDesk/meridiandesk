"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { appUi, brand } from "@/content/copy";
import { VMark } from "@/components/home/parts";
import { LatencyChip } from "./bits";

const tabs = [
  { label: "Perps", href: "/app/perps" },
  { label: "Options", href: "/app/options" },
  { label: "Portfolio", href: "/app/portfolio" },
  { label: "Docs", href: "/docs" },
] as const;

export function AppHeader() {
  const path = usePathname();
  const [note, setNote] = useState(false);
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
            {brand.chainLine.replace("On ", "")} · {brand.chainId}
          </span>
          <span className="hidden md:inline-flex">
            <LatencyChip />
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setNote((v) => !v)}
              aria-expanded={note}
              className="h-9 whitespace-nowrap rounded-[4px] bg-dawn px-3 font-inter text-[13.5px] text-void hover:bg-dawn-hi sm:px-4"
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">{appUi.connect}</span>
            </button>
            {note ? (
              <div role="status" className="absolute right-0 top-11 w-64 rounded-[6px] border border-white/10 bg-char-2 p-3 font-inter text-[12.5px] leading-relaxed text-haze shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
                {appUi.connectNote}
              </div>
            ) : null}
          </div>
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
