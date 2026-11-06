"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, useBalance, useConnect, useConnectors, useDisconnect, useReadContract, useSwitchChain, type Connector } from "wagmi";
import { appUi, wallet as w } from "@/content/copy";
import { ACTIVE_CHAIN_ID, addressUrl, chains, shortHex } from "@/content/chain";
import { deployed } from "@/content/deployments";

const btn = "h-9 whitespace-nowrap rounded-[4px] px-3 font-inter text-[13.5px] sm:px-4";
const fmt = (v: bigint, d: number, dp = 4) => {
  const n = Number(formatUnits(v, d));
  return n.toLocaleString("en-US", { maximumFractionDigits: dp });
};

/** USDG balance on the active chain, or "—" when disconnected / USDG not yet deployed. */
export function useUsdgBalance() {
  const { address, chainId } = useAccount();
  const usdg = deployed(ACTIVE_CHAIN_ID, "usdg");
  const q = useReadContract({
    address: usdg ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address && !!usdg && chainId === ACTIVE_CHAIN_ID },
  });
  return q.data === undefined ? "—" : fmt(q.data, 6, 2);
}

function WalletIcon({ c }: { c: Connector }) {
  if (c.icon) {
    // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs from EIP-6963
    return <img src={c.icon} alt="" className="size-7 rounded-[6px]" />;
  }
  return <span aria-hidden="true" className="grid size-7 place-items-center rounded-[6px] border border-white/10 font-plex text-[11px] text-haze">{c.name.slice(0, 1)}</span>;
}

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const connectors = useConnectors();
  const { connect, isPending, variables, error, reset } = useConnect();
  // Hide the generic "Injected" fallback when EIP-6963 already announced a named wallet.
  const named = connectors.filter((c) => c.id !== "injected");
  const list = named.length ? named : connectors.filter((c) => c.id === "injected" && typeof window !== "undefined" && "ethereum" in window);

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      aria-labelledby="wallet-title"
      className="m-auto w-[min(92vw,400px)] rounded-[10px] border border-white/10 bg-char p-0 text-ivory backdrop:bg-void/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h2 id="wallet-title" className="font-zal text-[17px] font-medium tracking-[-0.02em]">{w.title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={w.close} className="rounded-[4px] p-1 text-haze hover:text-ivory">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <p className="mt-1 font-plex text-[11px] text-smoke">{chains[ACTIVE_CHAIN_ID].name} · {ACTIVE_CHAIN_ID}</p>

        {list.length ? (
          <ul className="mt-5 space-y-2">
            {list.map((c) => {
              const busy = isPending && variables?.connector && "uid" in variables.connector && variables.connector.uid === c.uid;
              return (
                <li key={c.uid}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => { reset(); connect({ connector: c, chainId: ACTIVE_CHAIN_ID }, { onSuccess: () => ref.current?.close() }); }}
                    className="flex h-12 w-full items-center gap-3 rounded-[6px] border border-white/10 bg-void px-3 text-left font-inter text-[14px] text-ivory hover:border-dawn/60 disabled:opacity-60"
                  >
                    <WalletIcon c={c} />
                    <span className="flex-1">{c.id === "injected" ? w.browserWallet : c.name}</span>
                    {busy ? <span className="font-plex text-[11px] text-dawn">{w.confirmInWallet}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 rounded-[6px] border border-white/[0.08] bg-void p-4 font-inter text-[13px] leading-relaxed text-haze">
            {w.noWallet}{" "}
            <a className="text-dawn hover:text-dawn-hi" href="https://metamask.io/download" target="_blank" rel="noreferrer">MetaMask</a> ·{" "}
            <a className="text-dawn hover:text-dawn-hi" href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a>
          </div>
        )}

        {error ? <p role="alert" className="mt-3 font-inter text-[12.5px] text-dawn">{w.errorPrefix} {"shortMessage" in error ? String(error.shortMessage) : error.message}</p> : null}
        <p className="mt-5 font-inter text-[11.5px] leading-relaxed text-smoke">{w.footnote}</p>
      </div>
    </dialog>
  );
}

function AccountMenu({ onClose }: { onClose: () => void }) {
  const { address, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const eth = useBalance({ address, chainId: ACTIVE_CHAIN_ID });
  const usdg = useUsdgBalance();
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  if (!address) return null;
  return (
    <div ref={box} role="dialog" aria-label={w.account} className="absolute right-0 top-11 z-40 w-72 rounded-[8px] border border-white/10 bg-char-2 p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
      <p className="font-plex text-[11px] text-smoke">{connector?.name} · {chains[ACTIVE_CHAIN_ID].short}</p>
      <p className="mt-1 break-all font-plex text-[12.5px] text-ivory">{address}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div><dt className="font-inter text-[11px] text-smoke">ETH</dt><dd className="font-plex text-[14px] text-ivory">{eth.data ? fmt(eth.data.value, eth.data.decimals, 6) : "—"}</dd></div>
        <div><dt className="font-inter text-[11px] text-smoke">USDG</dt><dd className="font-plex text-[14px] text-ivory">{usdg}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }} className="rounded-[4px] border border-white/10 px-2.5 py-1.5 font-inter text-[12px] text-haze hover:border-white/30 hover:text-ivory">
          {copied ? w.copied : w.copy}
        </button>
        <a href={addressUrl(address)} target="_blank" rel="noreferrer" className="rounded-[4px] border border-white/10 px-2.5 py-1.5 font-inter text-[12px] text-haze hover:border-white/30 hover:text-ivory">Blockscout ↗</a>
        <button type="button" onClick={() => { disconnect(); onClose(); }} className="ml-auto rounded-[4px] px-2.5 py-1.5 font-inter text-[12px] text-haze hover:text-ivory">{w.disconnect}</button>
      </div>
    </div>
  );
}

const noop = () => () => {};
/** false during SSR + hydration, true after — wallet state only exists in the browser. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

export function WalletButton() {
  const mounted = useMounted();
  const { address, chainId, connector, status } = useAccount();
  const { switchChain, isPending: switching, error: switchError, reset } = useSwitchChain();
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);

  if (!mounted || status !== "connected" || !address) {
    return (
      <>
        <button type="button" onClick={() => setDialog(true)} disabled={mounted && status === "reconnecting"} className={`${btn} bg-dawn text-void hover:bg-dawn-hi disabled:opacity-60`}>
          <span className="sm:hidden">Connect</span>
          <span className="hidden sm:inline">{appUi.connect}</span>
        </button>
        {dialog ? <ConnectDialog onClose={() => setDialog(false)} /> : null}
      </>
    );
  }

  if (chainId !== ACTIVE_CHAIN_ID) {
    const phantom = /phantom/i.test(connector?.name ?? "") || connector?.id === "app.phantom";
    return (
      <div className="relative">
        <button type="button" disabled={switching} onClick={() => { reset(); switchChain({ chainId: ACTIVE_CHAIN_ID }); }} className={`${btn} border border-dawn/60 text-dawn hover:bg-dawn hover:text-void disabled:opacity-60`}>
          {switching ? w.confirmInWallet : `${w.switchTo} ${chains[ACTIVE_CHAIN_ID].short}`}
        </button>
        {switchError ? (
          <div role="alert" className="absolute right-0 top-11 z-40 w-72 rounded-[6px] border border-white/10 bg-char-2 p-3 font-inter text-[12.5px] leading-relaxed text-haze">
            {phantom ? w.phantomUnsupported : `${w.switchFailed} ${"shortMessage" in switchError ? String(switchError.shortMessage) : ""}`}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className={`${btn} flex items-center gap-2 border border-white/10 bg-char text-ivory hover:border-white/30`}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-dawn" />
        <span className="font-plex text-[12.5px]">{shortHex(address)}</span>
      </button>
      {menu ? <AccountMenu onClose={() => setMenu(false)} /> : null}
    </div>
  );
}
