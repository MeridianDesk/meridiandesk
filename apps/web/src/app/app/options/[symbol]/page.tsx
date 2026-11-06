import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeskView } from "@/components/desk/desk-view";
import { bySymbol, registry } from "@/content/registry";

type Params = Promise<{ symbol: string }>;

/** Registry is static: prerender every market so navigation is instant. */
export function generateStaticParams() {
  return registry.map((m) => ({ symbol: m.symbol }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} Options — Meridian Desk` };
}

async function Market({ params }: { params: Params }) {
  const { symbol } = await params;
  if (!bySymbol(symbol)) notFound();
  return <DeskView desk="options" symbol={symbol} />;
}

export default function OptionsMarket({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DeskView desk="options" />}>
      <Market params={params} />
    </Suspense>
  );
}
