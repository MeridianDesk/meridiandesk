"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hero } from "@/content/copy";
import { APP, Arrow, Wordmark, XLink } from "./parts";

/** Full header inside the hero frame; a compact floating pill once you scroll. */
export function VNav() {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const on = () => setDocked(window.scrollY > 160);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const link = "hidden px-3 font-inter text-[14px] text-haze hover:text-ivory";
  const links = (tab?: number) => (
    <>
      <Link tabIndex={tab} href="#desks" className={`${link} md:inline`}>Perps</Link>
      <Link tabIndex={tab} href="#desks" className={`${link} md:inline`}>Options</Link>
      <Link tabIndex={tab} href="#markets" className={`${link} lg:inline`}>Markets</Link>
      <Link tabIndex={tab} href="#risk" className={`${link} lg:inline`}>Risk</Link>
    </>
  );

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-20 p-2 md:p-3">
        <div className="flex items-center justify-between px-6 py-6 md:px-10">
          <Wordmark />
          <nav aria-label="Primary" className="flex items-center gap-2">
            {links()}
            <XLink className="ml-1 hidden h-[42px] w-[42px] items-center justify-center rounded-[4px] border border-white/10 text-haze hover:border-white/40 hover:text-ivory sm:inline-flex" />
            <Link
              href="/docs"
              className="ml-2 hidden h-[42px] items-center gap-2 rounded-[4px] border border-white/10 bg-char/[0.03] px-6 font-inter text-[14px] text-ivory hover:border-white/40 sm:inline-flex"
            >
              Docs <Arrow />
            </Link>
            <Link href={APP} className="inline-flex h-[42px] items-center rounded-[4px] bg-dawn px-6 font-inter text-[14px] text-void hover:bg-dawn-hi">
              {hero.primaryCta}
            </Link>
          </nav>
        </div>
      </header>

      <div aria-hidden={!docked} className={`fixed inset-x-0 top-3 z-50 flex justify-center px-3 ${docked ? "" : "pointer-events-none invisible"}`}>
        <div className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-char/85 py-2 pl-4 pr-2 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md md:gap-6">
          <Wordmark />
          <nav aria-label="Compact" className="flex items-center gap-1">
            {links(docked ? 0 : -1)}
            <Link
              href={APP}
              tabIndex={docked ? 0 : -1}
              className="inline-flex h-[36px] items-center rounded-[4px] bg-dawn px-4 font-inter text-[13px] text-void hover:bg-dawn-hi"
            >
              {hero.primaryCta}
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
