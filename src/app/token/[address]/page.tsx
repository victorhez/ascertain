import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ClusterGraph, ConcentrationChart, Funnel, VolumeChart } from "@/components/charts";
import { CopyButton } from "@/components/CopyButton";
import { EvidenceList } from "@/components/EvidenceList";
import { RuleTable } from "@/components/RuleTable";
import { Icon, ScoreRing, SectionHead, Stat, VerdictPill } from "@/components/ui";
import { commentary } from "@/lib/commentary";
import { SCENARIO_LABEL, ago, compactUsd, pct, short, verdictColor } from "@/lib/format";
import { getAnalysis } from "@/lib/service";
import { isAddress, probeToken } from "@/chain/live";
import { findFixture } from "@/fixtures";
import { defaultConfig } from "@/engine/config";
import type { Intent } from "@/engine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ intent?: string; verifier?: string; live?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const fx = findFixture(decodeURIComponent(address));
  return { title: fx ? `${fx.truth.token.symbol} verdict` : "Token verdict" };
}

const INTENTS: { id: Intent; label: string; q: string }[] = [
  { id: "creator", label: "Creator", q: "Am I ready for Ascended?" },
  { id: "trader", label: "Trader", q: "Is the activity organic?" },
  { id: "staker", label: "Staker", q: "What am I exposed to?" },
];

export default async function TokenPage({ params, searchParams }: Props) {
  const { address: raw } = await params;
  const id = decodeURIComponent(raw);
  const sp = await searchParams;
  const intent: Intent = (["creator", "trader", "staker"] as const).find((x) => x === sp.intent) ?? "creator";
  const verifierOn = sp.verifier !== "off";

  const resolved = await getAnalysis(id, { verifier: verifierOn, live: sp.live === "1" });
  if (!resolved) return <NotIndexed id={id} />;

  const { analysis: a, fixture } = resolved;
  const v = a.verdicts[intent];
  const c = await commentary(a, intent);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const val = (s: string) => a.findings.find((f) => f.signal === s && f.status === "published")?.value;
  const conc = val("concentration"), clus = val("funding_clusters"), eff = val("effective_holders"), vol = val("volume_per_wallet"), mc = val("market_cap"), wash = val("wash_loops");
  const base = `/token/${encodeURIComponent(id)}`;
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(sp.intent ? { intent: sp.intent } : {}), ...(sp.verifier ? { verifier: sp.verifier } : {}), ...extra });
    return `${base}?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-8 sm:px-6">
      <Link href="/tokens" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg"><span className="rotate-180"><Icon name="arrow" size={14} /></span>All tokens</Link>

      {/* ------------------------------------------------ header */}
      <header className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mono text-[40px] font-semibold leading-none tracking-tight sm:text-[52px]">{a.token.symbol}</h1>
            <span className="text-[18px] text-muted">{a.token.name}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="chip">{a.token.chainName} · {a.token.chainId}</span>
            {fixture && (fixture.onchain
              ? <span className="chip" style={{ color: "var(--go)" }}>On-chain mock launch · Elysium testnet · {SCENARIO_LABEL[a.token.scenario ?? ""]}</span>
              : <span className="chip" style={{ color: "var(--wait)" }}>Simulated launch · {SCENARIO_LABEL[a.token.scenario ?? ""]}</span>)}
            {fixture?.onchain && <a className="chip chip-link" href={`https://elysium.kinetiq.xyz/address/${a.token.address}`} target="_blank" rel="noreferrer">Explorer ↗</a>}
            <span className="chip mono">{short(a.token.address, 8, 6)}<CopyButton text={a.token.address} label="" className="!h-5 !w-5 !border-0 !p-0" /></span>
            <span className="chip"><span className="live-dot" />{fixture?.onchain ? (sp.live === "1" ? `re-verified live ${ago(a.verifiedAt)}` : `receipts recorded from Elysium testnet RPC ${a.published[0]?.verifierRpc?.split("fetched ")[1] ?? ""}`) : `verified against replica B (simulated) ${ago(a.verifiedAt)}`}</span>
            {fixture?.onchain && <Link className="chip chip-link" href={q({ live: sp.live === "1" ? "0" : "1" })} replace>{sp.live === "1" ? "Use recorded receipts" : "Re-verify live"}</Link>}
            <span className="chip">block {a.headBlock.toLocaleString("en-US")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-muted">Verifier</span>
          <div className="flex rounded-xl border border-line p-1" role="group" aria-label="Verifier toggle">
            <Link href={q({ verifier: "on" })} replace className={`rounded-lg px-3 py-1.5 ${verifierOn ? "bg-fg text-bg" : "text-muted"}`}>On</Link>
            <Link href={q({ verifier: "off" })} replace className={`rounded-lg px-3 py-1.5 ${!verifierOn ? "bg-fg text-bg" : "text-muted"}`}>Off</Link>
          </div>
        </div>
      </header>

      {!verifierOn && (
        <div className="mt-6 flex gap-3 rounded-2xl border p-4 text-[14px]" style={{ borderColor: "var(--nogo)", background: "color-mix(in oklab, var(--nogo) 9%, transparent)" }}>
          <span style={{ color: "var(--nogo)" }}><Icon name="alert" /></span>
          <p className="leading-relaxed"><b className="font-medium">Verifier removed.</b> With no second-source re-fetch, every finding is withheld and no verdict can be asserted. That is the evidence-first guarantee: <Link className="underline underline-offset-4" href={q({ verifier: "on" })}>turn the verifier back on</Link> to publish.</p>
        </div>
      )}

      {/* ------------------------------------------------ intent tabs */}
      <nav className="mt-8 grid gap-2 sm:grid-cols-3" aria-label="Intent">
        {INTENTS.map((t) => {
          const on = t.id === intent;
          return (
            <Link key={t.id} href={q({ intent: t.id })} replace className="card flex items-center justify-between px-4 py-3 transition-colors hover:border-line2" style={on ? { borderColor: "var(--fg)" } : undefined} aria-current={on}>
              <span>
                <span className="block text-[14px] font-medium">{t.label}</span>
                <span className="block text-[12px] text-muted">{t.q}</span>
              </span>
              <VerdictPill verdict={a.verdicts[t.id].verdict} size="sm" />
            </Link>
          );
        })}
      </nav>

      {/* ------------------------------------------------ verdict */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: verdictColor(c.verdict) }} aria-hidden />
          <div className="relative flex flex-wrap items-center gap-8">
            <ScoreRing score={v.score} verdict={c.verdict} partial={v.scoreIsPartial} />
            <div className="min-w-[220px] flex-1">
              <div className="eyebrow mb-2">{intent} verdict</div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[46px] font-semibold leading-none tracking-[-0.04em] sm:text-[56px]" style={{ color: verdictColor(c.verdict) }}>{c.verdict}</span>
                {c.downgraded && <span className="pill pill-wait">downgraded by advisory</span>}
              </div>
              <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-muted">
                {v.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
          {v.flip.length > 0 && (
            <div className="relative mt-7 border-t border-line pt-5">
              <div className="eyebrow mb-3">What would change this</div>
              <ul className="space-y-2 text-[13.5px] leading-relaxed text-muted">
                {v.flip.map((f, i) => <li key={i} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg" />{f}</li>)}
              </ul>
            </div>
          )}
          <div className="relative mt-6 border-t border-line pt-4 text-[11.5px] leading-relaxed text-dim">
            Estimate based on public Ascend criteria (config <span className="mono">{v.configVersion}</span>). Not an official Ascend decision. Digest <span className="mono">{v.inputsDigest.slice(0, 16)}…</span>
          </div>
        </div>

        <div className="card flex flex-col justify-between gap-6 p-6">
          {eff ? <Funnel raw={eff.raw} effective={eff.effective} /> : <p className="text-[13px] text-muted">Effective holders unavailable: the supporting finding was withheld.</p>}
          <div className="grid grid-cols-2 gap-5 border-t border-line pt-5">
            <Stat label="Market cap" value={mc ? compactUsd(mc.marketCapUsd) : "n/a"} sub="price × (supply − burn)" />
            <Stat label="Organic vol / day" value={vol ? compactUsd(vol.weightedOrganicDailyUsd) : "n/a"} sub="time-weighted, 7d" />
            <Stat label="Top-10 share" value={conc ? pct(conc.top10, 0) : "n/a"} tone={conc && conc.top10 > defaultConfig.rules.top10_share.max! ? (conc.top10 > defaultConfig.rules.top10_share.hardMax! ? "nogo" : "wait") : undefined} />
            <Stat label="Inflated volume" value={vol ? pct(vol.inflatedShare, 0) : "n/a"} tone={vol && vol.inflatedShare > defaultConfig.rules.inflated_volume_share.max! ? (vol.inflatedShare > defaultConfig.rules.inflated_volume_share.hardMax! ? "nogo" : "wait") : undefined} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ advisory */}
      <section className="card mt-4 flex flex-wrap items-start gap-4 p-5">
        <span className="pill pill-mute shrink-0">{c.source === "ai" ? "AI commentary" : "Plain-language summary"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-relaxed">{c.text}</p>
          <p className="mt-2 text-[12px] text-dim">{c.note}</p>
        </div>
      </section>

      {/* ------------------------------------------------ rules */}
      <section className="mt-16">
        <SectionHead eyebrow="Score breakdown" title="Every rule, every number.">Thresholds live in a versioned config, are shown here, and are labelled estimates. Hard rules decide No-go on their own.</SectionHead>
        <div className="card-solid p-2 sm:p-4"><RuleTable rules={v.breakdown} /></div>
      </section>

      {/* ------------------------------------------------ charts */}
      <section className="mt-16 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-1 text-[17px] font-semibold tracking-tight">Holder concentration</h3>
          <p className="mb-5 text-[13px] text-muted">Ascend checks for concentrated accumulation.</p>
          {conc ? <ConcentrationChart value={conc} /> : <Withheld what="concentration" />}
        </div>
        <div className="card p-6">
          <h3 className="mb-1 text-[17px] font-semibold tracking-tight">Linked wallets</h3>
          <p className="mb-5 text-[13px] text-muted">Wallets whose first funding traces to the same source, merged into effective holders.</p>
          {clus && eff ? <ClusterGraph clusters={a.chart.graph.clusters.map((x) => ({ ...x, hops: clus.clusters.find((c: any) => c.id === x.id)?.hops ?? 1 }))} organic={a.chart.graph.organic} washWallets={wash?.washWalletCount ?? 0} /> : <Withheld what="funding clusters" />}
        </div>
        <div className="card p-6 lg:col-span-2">
          <h3 className="mb-1 text-[17px] font-semibold tracking-tight">Volume per unique wallet</h3>
          <p className="mb-5 text-[13px] text-muted">Total volume split into organic and inflated, with volume per effective wallet over time. {vol && <>Time-weighted organic volume: <b className="mono font-medium text-fg">{compactUsd(vol.weightedOrganicDailyUsd)}</b> per day.</>}</p>
          {vol ? <VolumeChart days={vol.days} /> : <Withheld what="volume" />}
        </div>
      </section>

      {/* ------------------------------------------------ evidence */}
      <section className="mt-16" id="evidence">
        <SectionHead eyebrow="Evidence" title="Published findings and receipts.">Open any finding to see the facts it cites and a copy-paste command that reproduces each one from chain state.</SectionHead>
        <EvidenceList findings={a.findings.filter((f) => f.status === "published")} />
        {a.published.length === 0 && <p className="text-[14px] text-muted">Nothing published. {verifierOn ? "" : "The verifier is switched off."}</p>}
      </section>

      <section className="mt-16" id="withheld">
        <SectionHead eyebrow="Withheld" title="Claims we did not publish.">Findings that failed verification are listed openly, with the reason, instead of being quietly dropped.</SectionHead>
        {a.withheld.length === 0 ? (
          <div className="card flex items-center gap-3 p-5 text-[14px] text-muted"><span style={{ color: "var(--go)" }}><Icon name="shield" /></span>Nothing withheld. Every finding for this token re-fetched identically.</div>
        ) : (
          <EvidenceList findings={a.withheld} />
        )}
      </section>

      {/* ------------------------------------------------ ground truth */}
      {fixture && (
        <section className="mt-16">
          <SectionHead eyebrow="Back-test" title="Planted versus found.">The pattern in this mock launch was planted by us, so the answer is known. Ascertain never sees it.</SectionHead>
          <div className="card grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <GT label="Raw holders" planted={fixture.info.rawHolders} found={eff?.raw} />
            <GT label="Effective holders" planted={fixture.info.plantedEffectiveHolders} found={eff?.effective} />
            <GT label="Linked groups" planted={fixture.info.plantedClusters.length} found={clus?.clusterCount} />
            <GT label="Wash wallets" planted={fixture.info.plantedWashWallets.length} found={wash?.washWalletCount} />
          </div>
          {fixture.drift && (
            <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-muted"><span style={{ color: "var(--wait)" }}><Icon name="alert" size={15} /></span>Injected for demonstration: {fixture.drift.description}</p>
          )}
        </section>
      )}

      {/* ------------------------------------------------ creator / badge */}
      <section className="mt-16 grid gap-4 lg:grid-cols-2" id="badge">
        <div className="card p-6">
          <div className="eyebrow mb-3">Creator view</div>
          <h3 className="text-[19px] font-semibold tracking-tight">Lifecycle tracker and revenue planner</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">See where this token sits across Launch, Ascended, HyperCore spot and HIP-3, what is known and unknown at each stage, and model creator fee revenue and a listing reserve.</p>
          <Link href={`/creator/${a.token.symbol}`} className="btn mt-5">Open creator dashboard <Icon name="arrow" size={16} /></Link>
        </div>
        <div className="card p-6">
          <div className="eyebrow mb-3">Verified badge</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${a.token.symbol}.svg`} alt={`Ascertain badge for ${a.token.symbol}`} height={28} className="h-7" />
          <pre className="code mt-4 !text-[11.5px]">{`<a href="${origin}/token/${a.token.symbol}">\n  <img src="${origin}/api/badge/${a.token.symbol}.svg" alt="Ascertain verdict" />\n</a>`}</pre>
          <p className="mt-3 text-[12px] text-dim">The badge turns stale-gray automatically when its data is older than the limit ({Math.round(defaultConfig.stalenessLimitMs / 3600000)}h by default, override with <span className="mono">?maxAge=</span> seconds).</p>
        </div>
      </section>
    </div>
  );
}

function Withheld({ what }: { what: string }) {
  return <p className="rounded-xl border border-line p-4 text-[13px] leading-relaxed text-muted">The {what} finding is not published (withheld or verifier off), so nothing is shown rather than an unverified number.</p>;
}

function GT({ label, planted, found }: { label: string; planted: number; found?: number }) {
  const ok = found === planted;
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="mono text-[28px] font-semibold tracking-tight">{found ?? "n/a"}</span>
        <span className="mono text-[12.5px] text-dim">planted {planted}</span>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: ok ? "var(--go)" : "var(--wait)" }}>{ok ? "exact match" : found == null ? "withheld" : "differs"}</div>
    </div>
  );
}

async function NotIndexed({ id }: { id: string }) {
  const addressLike = isAddress(id);
  const probe = addressLike ? await probeToken(id) : null;
  return (
    <div className="mx-auto max-w-[760px] px-4 py-24 sm:px-6">
      <div className="eyebrow mb-3">Not indexed</div>
      <h1 className="text-[36px] font-semibold leading-tight tracking-[-0.03em]">{addressLike ? "Ascertain has not indexed this token yet." : `No token matches “${id.slice(0, 40)}”.`}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-muted">
        Ascertain publishes verdicts only for tokens in its indexed list, because a verdict needs the full holder set and every swap, not a sample. It never guesses.
      </p>
      {probe?.found && (
        <div className="card mt-8 p-5">
          <div className="eyebrow mb-3">On-chain probe (read-only)</div>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[14px]">
            <dt className="text-muted">Chain</dt><dd>{probe.chainName} · {probe.chainId}</dd>
            <dt className="text-muted">Name</dt><dd>{probe.name ?? "n/a"}</dd>
            <dt className="text-muted">Symbol</dt><dd className="mono">{probe.symbol ?? "n/a"}</dd>
            <dt className="text-muted">Supply</dt><dd className="mono">{probe.totalSupply ?? "n/a"}</dd>
          </dl>
        </div>
      )}
      {addressLike && probe && !probe.found && <p className="mt-6 text-[14px] text-muted">No contract found at that address on Elysium testnet or HyperEVM{probe.error ? ` (${probe.error})` : ""}.</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/tokens" className="btn btn-primary">Browse indexed tokens</Link>
        <Link href="/methodology#indexing" className="btn">How to index a token</Link>
      </div>
    </div>
  );
}
