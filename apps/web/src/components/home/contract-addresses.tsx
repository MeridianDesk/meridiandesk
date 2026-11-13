"use client";

import { useState } from "react";
import { contractFooter, token } from "@/content/copy";
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

export function ContractAddresses({ className = "" }: { className?: string }) {
  return (
    <section id="contracts" aria-labelledby="contracts-h" className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="contracts-h" className="font-zal text-[22px] font-medium tracking-[-0.03em] text-ivory md:text-[26px]">{contractFooter.title}</h2>
        <p className="font-plex text-[11px] text-smoke">{contractFooter.note}</p>
      </div>
      <div className="mt-6 overflow-x-auto rounded-[10px] border border-white/10 bg-char/60 px-5 pt-4 md:px-6">
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
              <tr key={c.key} className="border-t border-white/[0.06] last:[&>*]:pb-4">
                <th scope="row" className="py-2.5 pr-6 font-normal">
                  <span className="block text-[13px] text-ivory/90">{c.key === "usdg" ? "USDG" : c.key}</span>
                  <span className="block text-[11.5px] text-smoke">{c.role}</span>
                </th>
                {NETS.map((id) => (
                  <td key={id} className="py-2.5 pr-6">
                    <Addr chainId={id} a={deployed(id, c.key)} external={c.key === "usdg"} />
                    {c.key === "usdg" && id === 46630 && deployed(id, c.key) && (
                      <span className="mt-0.5 block font-inter text-[11px] text-smoke">{contractFooter.testUsdg}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-white/[0.06] last:[&>*]:pb-4">
              <th scope="row" className="py-2.5 pr-6 font-normal">
                <span className="block text-[13px] text-ivory/90">${token.symbol}</span>
                <span className="block text-[11.5px] text-smoke">{token.name} token</span>
              </th>
              {NETS.map((id) => (
                <td key={id} className="py-2.5 pr-6">
                  {id === token.chainId ? <Addr chainId={id} a={token.address} /> : <span className="font-plex text-[12px] text-smoke">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
