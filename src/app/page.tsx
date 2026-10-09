import Link from "next/link";
import { HeroField } from "@/components/HeroField";
import { Lifecycle } from "@/components/Lifecycle";
import { SearchBox } from "@/components/SearchBox";
import { TokenCard } from "@/components/TokenCard";
import { Icon, SectionHead, VerdictPill } from "@/components/ui";
import { getAnalysis, listTokens } from "@/lib/service";
import { short } from "@/lib/format";
import backtest from "../../evidence/backtest-summary.json";

export const revalidate = 60;

export default async function Home() {
  const tokens = await listTokens();
  const mira = (await getAnalysis("MIRA"))!.analysis;
  const eff = mira.findings.find((f) => f.signal === "effective_holders")!.value;
  const clusters = mira.findings.find((f) => f.signal === "funding_clusters")!;
  const sizes: number[] = clusters.value.clusters.map((c: any) => c.size);
  const receipt = clusters.receipts?.find((r) => r.kind === "tx");
  const withheld = tokens.flatMap((t) => t.withheld ? [t] : []).length;

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="mx-auto max-w-[1180px] px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr]">
          <div>
            <div className="rise chip mb-6"><span className="live-dot" />Built for Ascend launches on Elysium</div>
            <h1 className="rise text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[64px]" style={{ ["--d" as string]: ".05s" }}>
              Know who is<br />really holding.
            </h1>
            <p className="rise mt-6 max-w-[34rem] text-[17px] leading-relaxed text-muted" style={{ ["--d" as string]: ".12s" }}>
              Ascertain separates real participants from coordinated and wash activity, then returns a <b className="font-medium text-fg">Go, Wait or No-go</b> verdict for where a token stands in the Ascend lifecycle. Every claim ships with evidence anyone can re-fetch from chain state.
            </p>
            <div className="rise mt-9 max-w-[34rem]" style={{ ["--d" as string]: ".2s" }}>
              <SearchBox examples={[{ symbol: "LUMEN", label: "organic" }, { symbol: "MIRA", label: "clustered" }, { symbol: "WAVE", label: "wash" }]} />
            </div>
            <div className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted" style={{ ["--d" as string]: ".28s" }}>
              <span className="inline-flex items-center gap-2"><Icon name="check" size={15} />No custody</span>
              <span className="inline-flex items-center gap-2"><Icon name="check" size={15} />Read-only chain access</span>
              <span className="inline-flex items-center gap-2"><Icon name="check" size={15} />Rules in code, AI can only downgrade</span>
            </div>
          </div>
          <div className="card rise relative p-4 sm:p-6" style={{ ["--d" as string]: ".15s" }}>
            <HeroField raw={eff.raw} effective={eff.effective} clusterSizes={sizes} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ proof strip */}
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6" aria-label="Back-test results">
        <div className="card grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
          <Proof n={backtest.summary.plantedClustersFound} l="planted clusters found" />
          <Proof n={String(backtest.summary.falsePositiveClustersOnCleanTokens + backtest.summary.falsePositiveWashWalletsOnCleanTokens)} l="false positives on clean tokens" />
          <Proof n={backtest.summary.plantedWashWalletsFound} l="planted wash wallets found" />
          <Proof n={`${backtest.summary.findingsWithheldByVerifier}/${backtest.summary.findingsTotal}`} l="findings withheld by the verifier" />
        </div>
        <p className="mt-3 text-center text-[12px] text-dim">Back-test on five simulated Elysium-testnet launches with planted ground truth. Reproduce with <code className="mono text-muted">npm run backtest</code>.</p>
      </section>

      {/* ------------------------------------------------------------ launches */}
      <section className="mx-auto mt-28 max-w-[1180px] px-4 sm:px-6">
        <SectionHead eyebrow="Mock launches" title="Five launches. Five verdicts.">
          Deterministic simulated launches with planted ground truth: clean, early, concentrated, wash-traded and clustered. Open any of them and re-fetch the evidence.
        </SectionHead>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map((t, i) => <TokenCard key={t.address} t={t} delay={i * 0.05} />)}
          <Link href="/tokens" className="card flex min-h-[200px] flex-col items-start justify-between p-5 transition-colors hover:border-line2">
            <span className="eyebrow">Index</span>
            <div>
              <div className="text-[18px] font-semibold tracking-tight">All indexed tokens</div>
              <div className="mt-1 inline-flex items-center gap-2 text-[13px] text-muted">Search, filter by verdict <Icon name="arrow" size={15} /></div>
            </div>
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="mx-auto mt-28 max-w-[1180px] px-4 sm:px-6">
        <SectionHead eyebrow="How it works" title="From raw logs to a verdict you can audit.">
          Four stages, each deterministic and versioned. Nothing is published that has not survived an independent re-fetch.
        </SectionHead>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            ["01", "layers", "Index", "Raw logs, block numbers and transaction hashes from Elysium (or any EVM chain) land in Postgres-style storage. Never only derived numbers."],
            ["02", "eye", "Detect", "Concentration, funding-source clusters, same-block entry, wash loops and wallet age. Linked wallets merge into effective holders."],
            ["03", "shield", "Verify", "A separate verifier re-fetches every cited fact from an independent RPC and compares byte for byte. Failures are withheld, in public."],
            ["04", "bolt", "Decide", "Versioned thresholds produce GO, WAIT or NO-GO. AI commentary can veto a Go. It can never unlock one."],
          ].map(([n, ic, t, d]) => (
            <li key={n} className="card p-5">
              <div className="flex items-center justify-between text-muted"><span className="mono text-[11px] text-dim">{n}</span><Icon name={ic as any} /></div>
              <div className="mt-6 text-[19px] font-semibold tracking-tight">{t}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ evidence first */}
      <section className="mx-auto mt-28 grid max-w-[1180px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <div className="eyebrow mb-3">Evidence-first publishing</div>
          <h2 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">Delete the verifier and nothing is published.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            A finding goes live only if every fact it cites re-fetches from chain state and matches. If one does not, the claim is withheld and listed, with the reason. Try it on any token page: switch the verifier off and watch every finding drop.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/token/MIRA?verifier=off" className="btn btn-primary">See it with the verifier off <Icon name="arrow" size={16} /></Link>
            <Link href="/withheld" className="btn">{withheld} tokens with withheld findings</Link>
          </div>
        </div>
        <div className="card-solid overflow-hidden shadow-[var(--shadow)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="eyebrow">Evidence receipt</span>
            <span className="pill pill-go !h-[22px] !text-[11px]"><Icon name="check" size={12} />verified byte-for-byte</span>
          </div>
          <div className="space-y-3 p-5 text-[12.5px]">
            <Row k="finding" v={clusters.id} />
            <Row k="signal" v={`${clusters.signal} · ${clusters.ruleVersion}`} />
            <Row k="claim" v={clusters.summary} wrap />
            {receipt && <>
              <Row k="chain / block" v={`${receipt.chainId} · ${receipt.blockNumber.toLocaleString("en-US")}`} />
              <Row k="tx" v={short(receipt.txHash ?? "", 14, 10)} />
              <Row k="verifier" v={receipt.verifierRpc} />
            </>}
            {receipt && <pre className="code mt-1 !text-[11.5px]"><span className="c"># re-fetch it yourself</span>{"\n"}{receipt.reproduce}</pre>}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ audiences */}
      <section className="mx-auto mt-28 max-w-[1180px] px-4 sm:px-6">
        <SectionHead eyebrow="Who it is for" title="One verdict, four ways to read it." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Creators", "Where am I against Ascended, and what exactly do I fix? Get the failing rules, the gap, and a revenue and listing-reserve planner.", "/creator/RISE", "Open a creator view"],
            ["Traders", "Is this volume organic before I buy? A fast verdict with the inflated share of volume called out.", "/token/WAVE?intent=trader", "See a trader view"],
            ["HYPE stakers", "What ecosystem tokens might I be exposed to, and how concentrated are they?", "/token/HOLD?intent=staker", "See a staker view"],
            ["AI agents", "A callable source of truth over MCP, REST and x402, paid per answer, before an agent acts.", "/agents", "Wire up an agent"],
          ].map(([t, d, h, c]) => (
            <Link key={t} href={h} className="card group flex flex-col justify-between p-5 transition-colors hover:border-line2">
              <div>
                <div className="text-[19px] font-semibold tracking-tight">{t}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{d}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-[13px] text-fg">{c}<Icon name="arrow" size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ agents */}
      <section className="mx-auto mt-28 grid max-w-[1180px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <pre className="code shadow-[var(--shadow)]">
<span className="c"># 1. an agent asks, with no payment</span>{"\n"}
<span className="k">GET</span> /v1/token/MIRA/readiness?tier=paid{"\n"}
<span className="k">402</span> Payment Required  {"{"} x402Version: 1, accepts: [{"{"} scheme: &quot;exact&quot;,{"\n"}
{"     "}network: &quot;base-sepolia&quot;, maxAmountRequired: &quot;10000&quot; {"}"}] {"}"}{"\n\n"}
<span className="c"># 2. it signs a USDC authorization and retries</span>{"\n"}
<span className="k">GET</span> /v1/token/MIRA/readiness?tier=paid{"\n"}
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1l…{"\n"}
<span className="k">200</span> {"{"} verdict: &quot;NO-GO&quot;, score: {mira.verdicts.creator.score}, findings: [{mira.findings.length}] {"}"}
          </pre>
        </div>
        <div className="order-1 lg:order-2">
          <div className="eyebrow mb-3">Agent-native</div>
          <h2 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">Check before the agent acts. Pay a cent for the answer.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">
            An MCP server, a REST API with an OpenAPI file, and x402 pay-per-answer ship in the first release. Verdicts are free to sample, deep reports are paid, evidence is always free.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/agents" className="btn btn-primary">Run the x402 flow live <Icon name="arrow" size={16} /></Link>
            <Link href="/openapi.json" className="btn">OpenAPI</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ lifecycle */}
      <section className="mx-auto mt-28 max-w-[1180px] px-4 sm:px-6">
        <SectionHead eyebrow="Built for Ascend's lifecycle" title="Launch, Ascended, HyperCore spot, HIP-3.">
          Mapped to the criteria Ascend has published, with what is known and what is not disclosed at every stage.
        </SectionHead>
        <Lifecycle activeIndex={0} />
      </section>

      {/* ------------------------------------------------------------ honesty */}
      <section className="mx-auto mt-28 max-w-[1180px] px-4 sm:px-6">
        <div className="card p-7 sm:p-10">
          <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="eyebrow mb-3">Honest about limits</div>
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">What Ascertain does not claim.</h2>
            </div>
            <ul className="space-y-4 text-[14.5px] leading-relaxed text-muted">
              <li><b className="font-medium text-fg">Scores are estimates.</b> Ascend&apos;s real thresholds are internal and some rules are at team discretion. Ours are configurable, versioned and labelled as estimates.</li>
              <li><b className="font-medium text-fg">Elysium mainnet is pre-launch.</b> Ascertain ships on testnet today; mainnet launch through Ascend is a roadmap milestone, not a promise.</li>
              <li><b className="font-medium text-fg">Patterns, not accusations.</b> Clusters read as &quot;linked by funding source&quot;. Ascertain never calls a person a scammer and publishes its false-positive rate and blind spots.</li>
              <li><b className="font-medium text-fg">Unaudited.</b> No audit is claimed. The methodology, every threshold and the code are public.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1180px] px-4 text-center sm:px-6">
        <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[46px]">Paste an address. Get a verdict. Check the proof.</h2>
        <div className="mx-auto mt-8 flex max-w-sm justify-center gap-3">
          <Link href="/#check" className="btn btn-primary">Check a token</Link>
          <Link href="/methodology" className="btn">Read the methodology</Link>
        </div>
        <div className="mt-6 flex justify-center gap-2"><VerdictPill verdict="GO" size="sm" /><VerdictPill verdict="WAIT" size="sm" /><VerdictPill verdict="NO-GO" size="sm" /></div>
      </section>
    </>
  );
}

function Proof({ n, l }: { n: string; l: string }) {
  return (
    <div className="px-6 py-6 text-center">
      <div className="mono text-[34px] font-semibold tracking-tight sm:text-[40px]">{n}</div>
      <div className="mt-1 text-[12.5px] text-muted">{l}</div>
    </div>
  );
}

function Row({ k, v, wrap }: { k: string; v: string; wrap?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <span className="text-dim">{k}</span>
      <span className={`mono ${wrap ? "" : "truncate"} text-fg`}>{v}</span>
    </div>
  );
}
