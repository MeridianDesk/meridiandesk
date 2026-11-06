import { redirect } from "next/navigation";

/** Landing ticker cards link here; Perps is the default desk for a market. */
export default async function MarketAlias({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  redirect(`/app/perps/${symbol.toUpperCase()}`);
}
