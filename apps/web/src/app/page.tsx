import Link from "next/link";
import { brand, desks, hero, how, latency, legal, manifesto, markets, proof, risk, why } from "@/content/copy";
import { clusters, featured } from "@/content/featured";
import { OptionsArt, PerpsArt } from "@/components/home/desk-art";
import { ContractAddresses } from "@/components/home/contract-addresses";
import { DeskTicket } from "@/components/home/desk-ticket";
import { VNav } from "@/components/home/nav";
import { WaveStage } from "@/components/home/particle-wave";
import { APP, Arrow, Card, GhostBtn, Kicker, Marquee, Monogram, PrimaryBtn, SectionTitle, VMark } from "@/components/home/parts";
import { Reveal3D, Tilt3D } from "@/components/home/tilt";

const wrap = "mx-auto w-full max-w-[1240px] px-6 md:px-10";
const short = "[@media(min-width:768px)_and_(max-height:780px)]";

export default function Home() {
  const half = Math.ceil(featured.length / 2);
  return (
    <div className="min-h-screen bg-void font-inter text-ivory">
      <VNav />
      <main>
        {/* 1 · HERO — framed light panel, interactive dotted terrain, featured strip inside the fold */}
        <section aria-labelledby="h-hero" className="p-2 md:p-3">
          <WaveStage
            className="relative isolate flex min-h-[calc(100svh-16px)] flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[radial-gradient(90%_70%_at_50%_118%,#3a2a1a_0%,#141210_42%,#060606_100%)] md:min-h-[calc(100svh-24px)]"
            waveClassName="absolute inset-x-0 bottom-0 -z-10 h-[46%]"
          >
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-[18%] bg-gradient-to-t from-void/70 to-transparent" />

            <div className={`${wrap} grid flex-1 items-center gap-10 pt-32 md:pt-36 ${short}:pt-24 xl:grid-cols-[1fr_400px]`}>
              <div className="self-start">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-char/[0.04] py-1 pl-1 pr-3 font-inter text-[12.5px] text-haze backdrop-blur-sm">
                  <span className="rounded-full bg-dawn px-2 py-0.5 font-plex text-[10.5px] uppercase tracking-[0.1em] text-void">Max 2×</span>
                  {brand.chainLine} · chain {brand.chainId}
                </div>
                <h1
                  id="h-hero"
                  className={`mt-7 max-w-[980px] font-zal text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] lg:text-[72px] xl:text-[64px] ${short}:text-[56px]`}
                >
                  {hero.headlineA}
                  <br />
                  <span className="v-grad-text">{hero.headlineB}</span>
                </h1>
                <p className="mt-6 max-w-[540px] [text-shadow:0_0_10px_#050505,0_0_3px_#050505] text-[16.5px] leading-relaxed text-haze md:text-[18px]">{hero.subhead}</p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <PrimaryBtn href={APP}>{hero.primaryCta}</PrimaryBtn>
                  <GhostBtn href="#markets">{hero.secondaryCta}</GhostBtn>
                  {/* <span className="ml-1 rounded-[3px] bg-void/80 px-2 py-1 font-plex text-[11px] uppercase tracking-[0.14em] text-haze">{hero.microLine}</span> */}
                </div>
              </div>

              {/* 3D ticket parked on a tipped plane (desktop, tall viewports) */}
              <div className="hero-plane hidden self-start pt-4 [@media(min-width:1280px)_and_(min-height:800px)]:block">
                <div className="hero-float relative mx-auto w-full max-w-[420px]">
                  <div aria-hidden="true" className="hero-ghost absolute inset-0 rounded-[10px] border border-dawn/20 bg-dawn/[0.04]" />
                  <Tilt3D max={7}>
                    <div className="z-pop-1">
                      <DeskTicket initial="perps" />
                    </div>
                  </Tilt3D>
                </div>
              </div>
            </div>

            <div aria-label={proof.label} role="region" className="relative mt-12 pb-6 md:pb-8">
              <div className={`${wrap} mb-2 flex items-center justify-between font-plex text-[11px] uppercase tracking-[0.14em] text-haze`}>
                <span>{proof.label}</span>
                <span className="hidden md:inline">Move · tap the wave</span>
              </div>
              <Marquee items={featured} duration={70} />
            </div>
          </WaveStage>
        </section>

        {/* Manifesto */}
        <section aria-label="Manifesto" className={`${wrap} py-28 md:py-36`}>
          <Reveal3D>
            <p className="max-w-[1000px] font-zal text-[28px] font-medium leading-[1.22] tracking-[-0.025em] md:text-[44px]">
              {manifesto.lead} <span className="text-smoke">{manifesto.payoff}</span>
            </p>
          </Reveal3D>
        </section>

        {/* 2 · TWO DESKS */}
        <section id="desks" aria-labelledby="h-desks" className={`${wrap} pb-28`}>
          <SectionTitle
            kicker={<Kicker>Two desks</Kicker>}
            title={
              <span id="h-desks">
                Two products. <span className="v-grad-text">Never one button.</span>
              </span>
            }
            sub="Perps and Options run as separate desks — separate navigation, risk engine and positions."
          />
          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            {([desks.perps, desks.options] as const).map((d, i) => (
              <Reveal3D key={d.title} delay={i * 120}>
                <Tilt3D max={6}>
                  <Card className="relative flex h-full flex-col overflow-hidden p-7 md:p-9">
                    <div className="flex items-center justify-between">
                      <span className="font-plex text-[11px] uppercase tracking-[0.16em] text-smoke">{d.tag}</span>
                      <Link href={APP} className="inline-flex items-center gap-1.5 text-[13.5px] text-dawn hover:text-dawn-hi">
                        Open {d.title} <Arrow />
                      </Link>
                    </div>
                    <h3 className="z-pop-2 mt-6 font-zal text-[40px] font-semibold tracking-[-0.03em] md:text-[52px]">{d.title}</h3>
                    <p className="mt-2 text-[16px] text-haze">{d.blurb}</p>
                    <div className="z-pop-3 mt-8 rounded-[6px] border border-white/10 bg-void p-4">{i === 0 ? <PerpsArt /> : <OptionsArt />}</div>
                    <dl className="z-pop-1 mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/10 bg-white/[0.07]">
                      {d.specs.map(([k, v]) => (
                        <div key={k} className="bg-char px-4 py-3.5">
                          <dt className="font-plex text-[10.5px] uppercase tracking-[0.14em] text-smoke">{k}</dt>
                          <dd className="mt-1 text-[14px] text-ivory">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </Card>
                </Tilt3D>
              </Reveal3D>
            ))}
          </div>
        </section>

        {/* 3 · FEATURED MARKETS */}
        <section id="markets" aria-labelledby="h-markets" className="border-y border-white/10 bg-char/60 py-28">
          <div className={`${wrap} flex flex-wrap items-end justify-between gap-6`}>
            <SectionTitle kicker={<Kicker>Markets</Kicker>} title={<span id="h-markets">{markets.title}</span>} sub={markets.sub} />
            <GhostBtn href={`${APP}/markets`}>
              {markets.link} <Arrow />
            </GhostBtn>
          </div>
          <div className="mt-14 space-y-3">
            <Marquee items={featured.slice(0, half)} duration={45} />
            <Marquee items={featured.slice(half)} duration={50} reverse />
          </div>
          <div className={`${wrap} mt-14 grid gap-5 md:grid-cols-3`}>
            {clusters.map((c, ci) => {
              const list = featured.filter((t) => t.cluster === c);
              return (
                <Reveal3D key={c} delay={ci * 100}>
                  <Tilt3D max={5}>
                    <Card className="h-full p-6">
                      <div className="flex items-baseline justify-between">
                        <h3 className="font-zal text-[18px] font-medium">{c}</h3>
                        <span className="font-plex text-[11px] text-smoke">{list.length} featured</span>
                      </div>
                      <ul className="z-pop-1 mt-5 divide-y divide-white/[0.07]">
                        {list.map((t) => (
                          <li key={t.symbol}>
                            <Link href={`${APP}/markets/${t.symbol}`} className="flex items-center gap-3 py-2.5 hover:text-dawn">
                              <Monogram t={t} size={20} />
                              <span className="w-14 font-zal text-[14px] font-medium">{t.symbol}</span>
                              <span className="flex-1 truncate text-[13.5px] text-haze">{t.name}</span>
                              <span className="font-plex text-[10.5px] text-smoke">Perps · Options</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Tilt3D>
                </Reveal3D>
              );
            })}
          </div>
          <p className={`${wrap} mt-6 font-plex text-[11px] text-smoke`}>
            Featured list is illustrative and landing-only. Live marks come from official oracle feeds in the app; tokens without a feed show “Oracle unavailable”.
          </p>
        </section>

        {/* 4 · WHY */}
        <section aria-labelledby="h-why" className={`${wrap} py-28 md:py-36`}>
          <SectionTitle
            kicker={<Kicker>{why.title}</Kicker>}
            title={
              <span id="h-why">
                Built like a desk, <span className="v-grad-text">not a casino.</span>
              </span>
            }
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {why.items.map((w, i) => (
              <Reveal3D key={w.k} delay={i * 110}>
                <Tilt3D max={8}>
                  <Card className="flex h-full min-h-[280px] flex-col p-7">
                    <span className="z-pop-2 grid size-11 place-items-center rounded-[6px] bg-dawn font-plex text-[13px] text-void shadow-[0_12px_24px_-10px_rgba(240,196,142,0.5)]">
                      {w.k}
                    </span>
                    <h3 className="z-pop-1 mt-auto font-zal text-[22px] font-medium leading-snug tracking-[-0.02em]">{w.title}</h3>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-haze">{w.body}</p>
                  </Card>
                </Tilt3D>
              </Reveal3D>
            ))}
          </div>
        </section>

        {/* 5 · EXECUTION / LATENCY — char band */}
        <section aria-labelledby="h-lat" className="p-2 md:p-3">
          <div className="relative isolate overflow-hidden rounded-[10px] border border-white/[0.08] bg-char py-24 text-ivory md:py-32">
            <div aria-hidden="true" className="absolute -left-40 -top-40 -z-10 size-[560px] rounded-full bg-dawn/10 blur-[120px]" />
            <div className={`${wrap} grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center`}>
              <SectionTitle dark kicker={<Kicker dark>Denim-grade execution</Kicker>} title={<span id="h-lat">{latency.title}</span>} sub={latency.sub} />
              <Reveal3D>
                <Tilt3D max={5}>
                  <Card dark className="p-2 [--glare:rgba(240,196,142,0.1)]">
                    <ul className="divide-y divide-white/[0.07]">
                      {latency.rows.map((r) => (
                        <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 px-5 py-5">
                          <div>
                            <div className="text-[15px]">{r.label}</div>
                            <div className="mt-0.5 font-plex text-[11px] text-smoke">{r.note}</div>
                          </div>
                          <div className="font-zal text-[24px] font-medium tracking-[-0.02em]">{r.value}</div>
                          <div className="col-span-2 h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
                            <div className="h-full rounded-full bg-gradient-to-r from-dawn-deep to-dawn-hi" style={{ width: `${(Math.log10(r.ms) / Math.log10(2000)) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                      <li className="z-pop-1 grid grid-cols-[1fr_auto] items-center gap-6 rounded-[6px] bg-dawn/10 px-5 py-5">
                        <div>
                          <div className="text-[15px]">{latency.meridianRow.label}</div>
                          <div className="mt-0.5 font-plex text-[11px] text-smoke">{latency.meridianRow.note}</div>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-[4px] border border-dawn/50 px-3 py-1.5 font-plex text-[12px] text-dawn-hi">
                          <span className="size-1.5 rounded-full bg-dawn-hi" aria-hidden="true" />
                          {latency.chip}
                        </span>
                      </li>
                    </ul>
                  </Card>
                </Tilt3D>
              </Reveal3D>
            </div>
          </div>
        </section>

        {/* 6 · HOW IT WORKS */}
        <section aria-labelledby="h-how" className={`${wrap} py-28 md:py-36`}>
          <SectionTitle kicker={<Kicker>Get started</Kicker>} title={<span id="h-how">{how.title}</span>} />
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {how.steps.map((s, i) => (
              <li key={s.k}>
                <Reveal3D delay={i * 110} className="h-full">
                  <Tilt3D max={8}>
                    <Card className="h-full p-7">
                      <span className="z-pop-2 grid size-10 place-items-center rounded-[6px] border border-white/10 bg-void font-zal text-[16px] text-dawn">{s.k}</span>
                      <h3 className="z-pop-1 mt-10 font-zal text-[20px] font-medium tracking-[-0.02em]">{s.title}</h3>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-haze">{s.body}</p>
                    </Card>
                  </Tilt3D>
                </Reveal3D>
              </li>
            ))}
          </ol>
        </section>

        {/* 7 · RISK */}
        <section id="risk" aria-labelledby="h-risk" className={`${wrap} pb-28`}>
          <Reveal3D>
            <Card className="grid gap-10 p-8 md:grid-cols-[0.8fr_1.2fr] md:p-12">
              <div>
                <Kicker>Risk</Kicker>
                <h2 id="h-risk" className="mt-5 font-zal text-[32px] font-semibold leading-tight tracking-[-0.025em] md:text-[40px]">
                  {risk.title}
                </h2>
                <p className="mt-4 font-plex text-[11.5px] text-smoke">{risk.footnote}</p>
              </div>
              <ul className="space-y-5">
                {risk.body.map((b, i) => (
                  <li key={i} className="flex gap-4 text-[15px] leading-relaxed text-haze">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-dawn" aria-hidden="true" />
                    <span className={i === 1 ? "text-ivory" : ""}>{b}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal3D>
        </section>

        {/* Closing CTA */}
        <section aria-labelledby="h-close" className="px-2 md:px-3">
          <div className="rounded-[10px] border border-white/10 bg-char px-6 py-20 md:px-14 md:py-28">
            <h2 id="h-close" className="font-zal text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] md:text-[88px]">
              Two desks.
              <br />
              <span className="v-grad-text">One chain.</span>
            </h2>
            <div className="mt-10 flex flex-wrap gap-3">
              <PrimaryBtn href={APP} size="lg">
                {hero.primaryCta}
              </PrimaryBtn>
              <GhostBtn href="/docs" size="lg">
                {hero.tertiaryCta} <Arrow />
              </GhostBtn>
            </div>
          </div>
        </section>
      </main>

      {/* 8 · FOOTER — char, closes on an interactive terrain */}
      <footer className="p-2 md:p-3">
        <WaveStage
          tone="dark"
          density={0.8}
          className="relative isolate flex flex-col overflow-hidden rounded-[10px] border border-white/[0.08] bg-char text-ivory"
          waveClassName="order-last relative h-[220px] md:h-[300px]"
        >
          <div className={`${wrap} grid gap-12 pb-6 pt-16 md:grid-cols-12`}>
            <div className="md:col-span-5">
              <div className="flex items-center gap-2">
                <VMark light />
                <span className="text-[20px] font-medium tracking-[-0.03em]">Meridian</span>
              </div>
              <p className="mt-5 max-w-sm text-[15px] font-medium leading-relaxed text-ivory/80">
                Stock Token Perps and Options on Robinhood Chain. Leverage capped at 2×.
              </p>
              <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed text-smoke">{legal.denimExplainer}</p>
            </div>
            {(
              [
                ["Product", [["Perps", "#desks"], ["Options", "#desks"], ["Markets", "#markets"], ["Launch App", APP]]],
                ["Resources", [["Docs", "/docs"], ["Risk", "#risk"]]],
              ] as const
            ).map(([h, ls]) => (
              <nav key={h} aria-label={h} className="md:col-span-2">
                <h3 className="text-[13px] text-smoke">{h}</h3>
                <ul className="mt-5 space-y-3.5">
                  {ls.map(([l, href]) => (
                    <li key={l}>
                      <Link href={href} className="text-[13.5px] text-dawn-hi hover:text-ivory">
                        {l}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div className="space-y-3 text-[12px] leading-relaxed text-smoke md:col-span-3">
              <p>{legal.affiliation}</p>
              <p>{legal.disclaimer}</p>
            </div>
            <div className="md:col-span-12">
              <ContractAddresses />
            </div>
          </div>
        </WaveStage>
      </footer>
    </div>
  );
}
