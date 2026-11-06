import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/desk/shell";
import { TxReceiptProvider } from "@/components/tx-receipt";

export const metadata: Metadata = { title: "Meridian Desk — App" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TxReceiptProvider>
    <div className="min-h-dvh bg-void text-ivory">
      {/* usePathname is runtime data: keep it inside a Suspense boundary so the shell can prerender. */}
      <Suspense fallback={<div className="h-[81px] border-b border-white/[0.07]" aria-hidden="true" />}>
        <AppHeader />
      </Suspense>
      <main>
        <Suspense fallback={<p className="p-6 font-plex text-[12px] text-smoke">Loading desk…</p>}>{children}</Suspense>
      </main>
    </div>
    </TxReceiptProvider>
  );
}
