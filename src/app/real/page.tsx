import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead, VerdictPill } from "@/components/ui";
import { getWorld } from "@/fixtures";
import { compactUsd, pct, short } from "@/lib/format";
import { getAnalysis } from "@/lib/service";
import handCheck from "../../../evidence/real/hand-check.json";

export const metadata: Metadata = { title: "Real-token results" };
export const dynamic = "force-dynamic";

export default async function RealResults() {
  const real = getWorld().fixtures.filter((f) => f.real);
  const rows = await Promise.all(real.map(async (f) => ({ f, a: (await getAnalysis(f.truth.token.address))!.analysis })));
  const decisions = handCheck.decisions as Record<string, { verdict: string; reason: string }>;
  const flagged = rows.flatMap(({ f }) => (f.report?.flags ?? []).map((x: any) => ({ sym: f.truth.token.symbol, ...x })));
  const confirmed = flagged.filter((x: any) => decisions[`${x.sym}:${x.id}`]?.verdict === "confirmed").length;
  const rejected = flagged.filter((x: any) => decisions[`${x.sym}:${x.id}`]?.verdict === "rejected").length;
  const reviewed = confirmed + rejected;

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Replay on production data</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Real-token results.</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">
        The engine replayed on {real.length} real HyperEVM mainnet tokens. This is a partial analysis: holder integrity only. Volume and market-cap signals need a swap adapter per DEX and are not computed yet. Results describe observable patterns, never intent.
      </p>

      <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Tokens replayed", String(real.length)], ["Clusters flagged", String(flagged.length)], ["Hand-checked", `${reviewed}/${flagged.length}`], ["False positives", reviewed ? `${rejected}/${reviewed}` : "pending"]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="mono text-[26px] font-semibold tracking-tight">{v}</div><div className="mt-1 text-[12px] text-muted">{l}</div></div>
        ))}
      </section>
      {!handCheck.reviewed && <p className="mt-3 text-[13px] leading-relaxed text-dim">Hand-check is in progress. A flag counts as a false positive only after someone opens the wallets on the explorer and rejects it; until then no false-positive rate is claimed.</p>}

      <section className="mt-12">
        <div className="card-solid scroll-x p-2 sm:p-4">
          <table className="tbl min-w-[760px]">
            <thead><tr><th>Token</th><th>Verdict</th><th>Holders</th><th>Top-1 / top-10</th><th>Clusters</th><th>Infrastructure excluded</th></tr></thead>
            <tbody>
              {rows.map(({ f, a }) => {
                const g = (s: string) => a.findings.find((x) => x.signal === s && x.status === "published")?.value;
                const c = g("concentration"), e = g("effective_holders");
                return (
                  <tr key={a.token.address}>
                    <td><Link className="mono font-semibold underline underline-offset-4" href={`/token/${a.token.symbol}`}>{a.token.symbol}</Link><div className="mono text-[11px] text-dim">{short(a.token.address, 8, 6)}</div></td>
                    <td><VerdictPill verdict={a.verdicts.creator.verdict} size="sm" /></td>
                    <td className="mono">{e ? `${e.raw.toLocaleString("en-US")}` : "n/a"}{e?.analyzedTopHolders ? <div className="text-[11px] text-dim">funding checked: top {e.analyzedTopHolders.toLocaleString("en-US")}</div> : null}</td>
                    <td className="mono">{c ? `${pct(c.top1)} / ${pct(c.top10, 0)}` : "withheld"}</td>
                    <td className="mono">{f.report?.flags?.length ?? 0}</td>
                    <td className="mono">{f.report?.contractsExcluded?.length ?? 0} holders, {f.report?.infra?.length ?? 0} funders</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <SectionHead eyebrow="Flags to hand-check" title="Every cluster, with links." />
        {flagged.length === 0 ? <p className="text-[14px] text-muted">No cluster survived the infrastructure filter on these tokens. That is a result, not proof of independence: funding links only see direct native-token funding of the top holders.</p> : (
          <ul className="space-y-3">
            {flagged.map((x: any) => {
              const d = decisions[`${x.sym}:${x.id}`];
              return (
                <li key={`${x.sym}${x.id}`} className="card-solid p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium"><span className="mono">{x.sym}:{x.id}</span> · {x.size} wallets linked by funding source</div><span className={`pill ${d ? (d.verdict === "confirmed" ? "pill-wait" : "pill-go") : "pill-mute"} !h-[22px] !text-[11px]`}>{d ? d.verdict : "awaiting hand-check"}</span></div>
                  <p className="mt-2 text-[13px] text-muted">Common funder <a className="mono underline underline-offset-4" target="_blank" rel="noreferrer" href={x.rootLink}>{short(x.root, 8, 6)}</a>{x.rootInfo ? ` (${x.rootInfo.contract ? "contract" : "account"}, ${x.rootInfo.nonce.toLocaleString("en-US")} transactions)` : ""}. {d?.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[12px]">{x.sampleWallets.map((w: any) => <a key={w.wallet} className="chip chip-link mono" target="_blank" rel="noreferrer" href={w.link}>{short(w.wallet, 6, 4)}</a>)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="prose-a mt-12">
        <h2>Method and limits</h2>
        <ul>
          <li>All ERC-20 transfers since contract creation were downloaded and balances rebuilt. Receipts re-fetch totalSupply, balances and nonces at the snapshot block, and funding transactions by hash.</li>
          <li>Contracts among the top 200 holders (pools, vaults, bridges) are excluded as infrastructure. Funders that are contracts or very busy accounts (over 20,000 transactions) are ignored as exchange-like or router-like. Both rules are heuristics and are listed per token in <code>evidence/real/</code>.</li>
          <li>Funding links use the first inbound native-token transfer of the top 1,000 holders. Funding through exchanges, mixers or contracts is invisible.</li>
          <li>Receipts were verified through the same RPC provider as the indexer, so they are a second request, not a second provider.</li>
          <li>No volume, market-cap, wash or same-block findings are published for real tokens yet.</li>
        </ul>
      </section>
    </div>
  );
}
