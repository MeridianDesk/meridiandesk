"use client";

import { useState } from "react";
import { token } from "@/content/copy";
import { addressUrl } from "@/content/chain";

/** Copyable MRDN contract address pill (hero). */
export function TokenCA({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(token.address); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-void/80 py-1.5 pl-3 pr-1.5 backdrop-blur ${className}`}>
      <span className="font-plex text-[11px] uppercase tracking-[0.14em] text-dawn">${token.symbol} {token.label}</span>
      <a href={addressUrl(token.address, token.chainId)} target="_blank" rel="noreferrer" title={token.address}
        className="truncate font-plex text-[12px] text-ivory/90 hover:text-dawn-hi">{token.address}</a>
      <button type="button" onClick={copy} aria-label={`Copy ${token.symbol} contract address`}
        className="shrink-0 rounded-full bg-white/10 px-3 py-1 font-inter text-[11px] text-ivory hover:bg-dawn hover:text-void">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
