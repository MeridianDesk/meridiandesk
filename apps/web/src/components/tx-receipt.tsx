"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { txReceipt } from "@/content/copy";
import { ACTIVE_CHAIN_ID, chains, isTxHash, shortHex, txUrl, type ChainId } from "@/content/chain";

export type TxSuccess = { hash: `0x${string}`; chainId?: ChainId; title?: string; summary?: string; preview?: boolean };

const Ctx = createContext<(tx: TxSuccess) => void>(() => {});
/** Call with the hash of a CONFIRMED transaction (after the receipt has status 1). */
export const useTxReceipt = () => useContext(Ctx);

export function TxReceiptProvider({ children }: { children: React.ReactNode }) {
  const [tx, setTx] = useState<TxSuccess | null>(null);
  const show = useCallback((t: TxSuccess) => { if (isTxHash(t.hash)) setTx(t); }, []);

  // Dev-only visual check: /app?txpreview=<real tx hash>. Stripped from production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const h = new URLSearchParams(window.location.search).get("txpreview");
    if (!h || !isTxHash(h)) return;
    const id = window.setTimeout(() => setTx({ hash: h, preview: true }), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {tx ? <TxReceiptDialog tx={tx} onClose={() => setTx(null)} /> : null}
    </Ctx.Provider>
  );
}

function TxReceiptDialog({ tx, onClose }: { tx: TxSuccess; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const chainId = tx.chainId ?? ACTIVE_CHAIN_ID;
  const url = txUrl(tx.hash, chainId);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(tx.hash); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      aria-labelledby="tx-title"
      className="m-auto w-[min(92vw,440px)] rounded-[10px] border border-white/10 bg-char p-0 text-ivory backdrop:bg-void/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-dawn/50 text-dawn">
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3.5 8.5l3 3 6-7" /></svg>
            </span>
            <div>
              <h2 id="tx-title" className="font-zal text-[17px] font-medium tracking-[-0.02em]">{tx.title ?? txReceipt.title}</h2>
              <p className="font-plex text-[11px] text-smoke">{chains[chainId].name}</p>
            </div>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label={txReceipt.close} className="rounded-[4px] p-1 text-haze hover:text-ivory">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {tx.summary ? <p className="mt-4 font-inter text-[13.5px] text-ivory/85">{tx.summary}</p> : null}

        <div className="mt-5 rounded-[6px] border border-white/[0.08] bg-void p-3">
          <p className="font-inter text-[11.5px] text-smoke">{txReceipt.hashLabel}</p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="break-all font-plex text-[12.5px] text-dawn-hi underline decoration-dawn/40 underline-offset-4 hover:text-ivory hover:decoration-ivory" title={tx.hash}>
              <span className="sm:hidden">{shortHex(tx.hash, 10, 8)}</span>
              <span className="hidden sm:inline">{shortHex(tx.hash, 18, 14)}</span>
            </a>
            <button type="button" onClick={copy} className="shrink-0 rounded-[4px] border border-white/10 px-2 py-1 font-inter text-[11.5px] text-haze hover:border-white/30 hover:text-ivory">
              {copied ? txReceipt.copied : txReceipt.copy}
            </button>
          </div>
        </div>

        {tx.preview ? <p className="mt-3 font-plex text-[11px] text-smoke">{txReceipt.previewNote}</p> : null}

        <div className="mt-6 flex gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center rounded-[4px] bg-dawn font-inter text-[13.5px] font-medium text-void hover:bg-dawn-hi">
            {txReceipt.viewOnExplorer} ↗
          </a>
          <button type="button" onClick={() => ref.current?.close()} className="h-10 rounded-[4px] border border-white/10 px-4 font-inter text-[13.5px] text-haze hover:border-white/30 hover:text-ivory">
            {txReceipt.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
