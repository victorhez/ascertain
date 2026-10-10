import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/ui";
import { getWorld } from "@/fixtures";
import { short } from "@/lib/format";
import team from "../../../config/team.json";

export const metadata: Metadata = { title: "Project overview and judge guide" };

export const GITHUB = "https://github.com/victorhez/ascertain";

const JUDGE: [string, string][] = [
  ["Paste a token, get a verdict with evidence", "/token/LUMT"],
  ["Delete the verifier and nothing is published", "/token/LUMT?verifier=off"],
  ["Withheld list", "/withheld"],
  ["Methodology and blind spots", "/methodology"],
  ["Agents: REST, MCP, x402 (run it live)", "/agents"],
  ["Creator dashboard and revenue planner", "/creator/LUMT#planner"],
];

const CODE: [string, string][] = [
  ["Concentration, funding clusters, same-block entry, wash loops, wallet age, effective holders, volume, market cap", "src/engine/signals.ts"],
  ["Evidence receipts and the independent verifier", "src/engine/evidence.ts, src/engine/verifier.ts"],
  ["Go / Wait / No-go rules and the AI downgrade-only guard", "src/engine/readiness.ts"],
  ["Thresholds (versioned estimates)", "config/thresholds.v1.json"],
  ["Mock launch contracts and the planting script", "contracts/, scripts/plant-testnet.ts"],
  ["x402 pay-per-answer", "src/x402/index.ts"],
  ["MCP server", "mcp/server.mjs"],
  ["Full verification of every fact on testnet", "scripts/verify-all.ts"],
];

const ROADMAP: [string, string, string][] = [
  ["Done", "Testnet MVP", "Indexer, eight signals, independent verifier, withheld list, dashboard, REST, MCP, x402 (demo settlement), badge, planner. Three mock launches deployed on Elysium testnet."],
  ["Next", "Real tokens and Ascend adapter", "Replay on real HyperEVM tokens with published results. Ascend hook-pool adapter once addresses and the event interface are available. Settle a real x402 payment on testnet."],
  ["Then", "Mainnet launch through Ascend", "Launch at Elysium mainnet. Alerts for creators and traders. Badge adoption by launched projects."],
  ["Later", "HyperCore-native checks", "Read HyperCore state directly for spot and HIP-3 readiness after the precompiles ship, about four weeks after mainnet."],
];

export default function Submission() {
  const chain = getWorld().fixtures.filter((f) => f.onchain);
  const members = (team as { members: { name: string; role: string; bio?: string; link?: string }[] }).members;
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Ascend Builder Program · Track 1</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Project overview and judge guide.</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">
        Ascertain is a verification and decision tool for tokens launched through Ascend. It separates real holders from coordinated or wash activity and returns a Go / Wait / No-go verdict, with evidence anyone can re-fetch from chain state.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a className="btn btn-primary" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        <Link className="btn" href="/methodology">Methodology</Link>
        <Link className="btn" href="/agents">API and MCP</Link>
      </div>

      <section className="mt-16">
        <SectionHead eyebrow="Deployed on Elysium testnet" title="Three mock launches, on chain.">
          Real contracts on Elysium testnet (chain 99801), planted with known patterns and indexed from chain logs. Every cited fact can be re-fetched with the <code className="mono">cast</code> commands in each receipt.
        </SectionHead>
        <div className="card-solid scroll-x p-2 sm:p-4">
          <table className="tbl min-w-[620px]">
            <thead><tr><th>Token</th><th>Pattern</th><th>Token contract</th><th>Pool</th></tr></thead>
            <tbody>
              {chain.map((f) => (
                <tr key={f.key}>
                  <td><Link className="mono font-semibold underline underline-offset-4" href={`/token/${f.truth.token.symbol}`}>{f.truth.token.symbol}</Link></td>
                  <td className="text-muted">{f.truth.token.scenario}</td>
                  <td><a className="mono underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://elysium.kinetiq.xyz/address/${f.truth.token.address}`}>{short(f.truth.token.address, 8, 6)}</a></td>
                  <td><a className="mono underline underline-offset-4" target="_blank" rel="noreferrer" href={`https://elysium.kinetiq.xyz/address/${f.truth.token.poolAddress}`}>{short(f.truth.token.poolAddress, 8, 6)}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-dim">
          The pool is a mock of Ascend&apos;s closed hook pools, not Ascend&apos;s contracts. The quote leg is accounting only. Five more launches on the site are simulated and labelled as such. Run <code className="mono text-muted">npm run verify:all</code> to re-fetch every log and funding transaction, not just the cited sample.
        </p>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Judge guide" title="Where to look." />
        <div className="grid gap-3 sm:grid-cols-2">
          {JUDGE.map(([l, h]) => <Link key={l} href={h} className="card p-4 text-[14px] transition-colors hover:border-line2">{l}</Link>)}
        </div>
        <div className="card-solid mt-4 scroll-x p-2 sm:p-4">
          <table className="tbl min-w-[560px]">
            <thead><tr><th>What</th><th>Code</th></tr></thead>
            <tbody>{CODE.map(([w, c]) => <tr key={c}><td className="text-muted">{w}</td><td className="mono text-[12.5px]"><a className="underline underline-offset-4" target="_blank" rel="noreferrer" href={`${GITHUB}/blob/main/${c.split(",")[0].trim()}`}>{c}</a></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Roadmap" title="Milestones." />
        <ol className="space-y-3">
          {ROADMAP.map(([s, t, d]) => (
            <li key={t} className="card flex gap-4 p-5"><span className={`pill ${s === "Done" ? "pill-go" : "pill-mute"} h-fit`}>{s}</span><div><div className="font-medium">{t}</div><p className="mt-1 text-[13.5px] leading-relaxed text-muted">{d}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Launch and growth" title="How this grows inside Elysium." />
        <ul className="space-y-3 text-[14.5px] leading-relaxed text-muted">
          <li><b className="font-medium text-fg">Free verdict tier</b> for builders, traders and stakers, so every launch can be checked before money moves.</li>
          <li><b className="font-medium text-fg">Paid API for agents</b> over x402: $0.01 per verdict, $0.05 per deep report, evidence always free. Agents are the repeat customers.</li>
          <li><b className="font-medium text-fg">Verified badge</b> that launched projects embed on their sites, linking back to the evidence page. Each badge is distribution.</li>
          <li><b className="font-medium text-fg">Launch through Ascend</b> at Elysium mainnet. If Ascend approves Ascertain as an active creator, the creator fee share funds data and RPC costs.</li>
          <li><b className="font-medium text-fg">Public analyses</b> of real tokens, published with their evidence, once the replay results are in.</li>
        </ul>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Token plan" title="Utility, not decoration." />
        <p className="text-[14.5px] leading-relaxed text-muted">
          Holding or staking the token discounts paid API calls and unlocks higher rate limits. Allocation and vesting will be published before launch and are subject to legal and compliance review for the relevant jurisdictions. No returns or price outcomes are promised anywhere in these materials.
        </p>
      </section>

      {members.length > 0 && (
        <section className="mt-16">
          <SectionHead eyebrow="Team" title="Who is building this." />
          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.name} className="card p-5"><div className="font-medium">{m.name}</div><div className="text-[13px] text-muted">{m.role}</div>{m.bio && <p className="mt-2 text-[13px] leading-relaxed text-muted">{m.bio}</p>}{m.link && <a className="mt-2 inline-block text-[13px] underline underline-offset-4" href={m.link} target="_blank" rel="noreferrer">Profile</a>}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
