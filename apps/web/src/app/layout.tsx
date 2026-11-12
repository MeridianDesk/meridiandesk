import type { Metadata } from "next";
import {
  Big_Shoulders,
  Funnel_Display,
  Funnel_Sans,
  Geist,
  Geist_Mono,
  Host_Grotesk,
  IBM_Plex_Mono,
  Instrument_Serif,
  Inter,
  Zalando_Sans_Expanded,
} from "next/font/google";
import "./globals.css";

// All font families are SIL Open Font License 1.1 — free for commercial use.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});
const hostGrotesk = Host_Grotesk({ variable: "--font-host-grotesk", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const funnelDisplay = Funnel_Display({ variable: "--font-funnel-display", subsets: ["latin"], weight: ["300", "400", "500"] });
const funnelSans = Funnel_Sans({ variable: "--font-funnel-sans", subsets: ["latin"], weight: ["300", "400", "500"] });
const zalando = Zalando_Sans_Expanded({ variable: "--font-zalando-expanded", subsets: ["latin"], weight: ["400", "500", "600"] });
const inter = Inter({ variable: "--font-inter-sans", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  twitter: { card: "summary_large_image", site: "@MeridianDesk33", creator: "@MeridianDesk33" },
  title: "Meridian Desk — Stock Token Perps and Options on Robinhood Chain",
  description:
    "Stock Token Perps and Options. One premium desk. Denim-grade execution on Robinhood Chain. Leverage capped at 2×. Full market catalog.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${bigShoulders.variable} ${hostGrotesk.variable} ${plexMono.variable} ${funnelDisplay.variable} ${funnelSans.variable} ${zalando.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
