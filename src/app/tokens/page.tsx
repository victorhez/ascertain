import type { Metadata } from "next";
import Link from "next/link";
import { Icon, VerdictPill } from "@/components/ui";
import { SCENARIO_LABEL, ago, compactUsd, num, short } from "@/lib/format";
import { listTokens } from "@/lib/service";

export const metadata: Metadata = { title: "Tokens" };
export const dynamic = "force-dynamic";

export default async function Tokens({ searchParams }: { searchParams: Promise<{ q?: string; verdict?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const vf = ["GO", "WAIT", "NO-GO"].includes(sp.verdict ?? "") ? sp.verdict : undefined;
  const all = await listTokens();
  const rows = all.filter((t) => (!vf || t.verdict === vf) && (!q || [t.symbol, t.name, t.address].some((s) => s.toLowerCase().includes(q))));
  const counts = { GO: all.filter((t) => t.verdict === "GO").length, WAIT: all.filter((t) => t.verdict === "WAIT").length, "NO-GO": all.filter((t) => t.verdict === "NO-GO").length };
  const href = (v?: string) => `/tokens?${new URLSearchParams({ ...(q ? { q } : {}), ...(v ? { verdict: v } : {}) }).toString()}`;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Index</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Tokens</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">Every indexed launch with its current verdict. These are simulated Elysium-testnet launches with planted ground truth; Ascend hook-pool addresses will plug in once published.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <form action="/tokens" className="card-solid flex min-w-[260px] flex-1 items-center gap-2 px-4 sm:max-w-md" role="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <label htmlFor="q" className="sr-only">Search by symbol, name or address</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Search symbol, name or address" className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-dim" />
          {vf && <input type="hidden" name="verdict" value={vf} />}
        </form>
        <div className="flex flex-wrap gap-2">
          <Link href={href()} className="chip chip-link" style={!vf ? { borderColor: "var(--fg)", color: "var(--fg)" } : undefined}>All · {all.length}</Link>
          {(["GO", "WAIT", "NO-GO"] as const).map((v) => (
            <Link key={v} href={href(v)} className="chip chip-link" style={vf === v ? { borderColor: "var(--fg)", color: "var(--fg)" } : undefined}>{v} · {counts[v]}</Link>
          ))}
        </div>
      </div>

      <div className="card-solid mt-6 overflow-hidden">
        <div className="scroll-x">
          <table className="tbl min-w-[860px]">
            <thead>
              <tr><th>Token</th><th>Verdict</th><th>Est. score</th><th>Holders → effective</th><th>Market cap</th><th>Organic vol / day</th><th>Verified</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.address} className="transition-colors hover:bg-[color-mix(in_oklab,var(--fg)_3%,transparent)]">
                  <td>
                    <Link href={`/token/${t.symbol}`} className="block">
                      <div className="mono text-[15px] font-semibold">{t.symbol} <span className="font-sans text-[13px] font-normal text-muted">{t.name}</span></div>
                      <div className="mono text-[11.5px] text-dim">{short(t.address, 8, 6)} · {SCENARIO_LABEL[t.scenario ?? ""]}</div>
                    </Link>
                  </td>
                  <td><VerdictPill verdict={t.verdict} size="sm" /></td>
                  <td className="mono">{t.score}</td>
                  <td className="mono">{num(t.rawHolders)} <span className="text-dim">→</span> <span style={t.rawHolders && t.effectiveHolders && t.effectiveHolders / t.rawHolders < 0.5 ? { color: "var(--nogo)" } : undefined}>{num(t.effectiveHolders)}</span></td>
                  <td className="mono">{t.marketCapUsd == null ? "n/a" : compactUsd(t.marketCapUsd)}</td>
                  <td className="mono">{t.organicVolumeUsd == null ? <span className="text-dim">withheld</span> : compactUsd(t.organicVolumeUsd)}</td>
                  <td className="text-[12.5px] text-muted">{ago(t.verifiedAt)}{t.withheld ? <span className="ml-2" style={{ color: "var(--wait)" }}>{t.withheld} withheld</span> : null}</td>
                  <td className="text-right"><Link href={`/token/${t.symbol}`} aria-label={`Open ${t.symbol}`} className="text-muted hover:text-fg"><Icon name="arrow" /></Link></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-14 text-center text-muted">No indexed token matches. Only configured tokens are indexed: <Link href="/methodology#indexing" className="underline underline-offset-4">how indexing works</Link>.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
