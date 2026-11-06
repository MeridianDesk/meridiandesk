"use client";

import { useState } from "react";
import { contractFooter } from "@/content/copy";
import { addressUrl, chains, shortHex, type ChainId } from "@/content/chain";
import { contractList, deployed } from "@/content/deployments";

const NETS: ChainId[] = [46630, 4663];

function Addr({ chainId, a, external }: { chainId: ChainId; a: `0x${string}` | null; external?: boolean }) {
  const [copied, setCopied] = useState(false);
  // USDG is not deployed by Meridian; until a deploy records it, show "—" rather than "Not deployed".
  if (!a) return <span className="font-plex text-[12px] text-smoke">{external ? "—" : contractFooter.notDeployed}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <a href={addressUrl(a, chainId)} target="_blank" rel="noreferrer" title={a} className="font-plex text-[12px] text-dawn-hi hover:text-ivory">
        {shortHex(a)} ↗
      </a>
      <button
        type="button"
        aria-label={`${contractFooter.copy} ${a}`}
        onClick={async () => { try { await navigator.clipboard.writeText(a); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }}
        className="font-inter text-[11px] text-smoke hover:text-ivory"
      >
        {copied ? contractFooter.copied : contractFooter.copy}
      </button>
    </span>
  );
}

export function ContractAddresses() {
  return (
    <section aria-labelledby="contracts-h" className="border-t border-white/[0.08] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="contracts-h" className="text-[13px] text-smoke">{contractFooter.title}</h3>
        <p className="font-plex text-[11px] text-smoke">{contractFooter.note}</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="font-inter text-[11.5px] text-smoke">
              <th scope="col" className="pb-3 font-normal">{contractFooter.contract}</th>
              {NETS.map((id) => (
                <th key={id} scope="col" className="pb-3 font-normal">{chains[id].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contractList.map((c) => (
              <tr key={c.key} className="border-t border-white/[0.06]">
                <th scope="row" className="py-2.5 pr-6 font-normal">
                  <span className="block text-[13px] text-ivory/90">{c.key === "usdg" ? "USDG" : c.key}</span>
                  <span className="block text-[11.5px] text-smoke">{c.role}</span>
                </th>
                {NETS.map((id) => (
                  <td key={id} className="py-2.5 pr-6"><Addr chainId={id} a={deployed(id, c.key)} external={c.key === "usdg"} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
