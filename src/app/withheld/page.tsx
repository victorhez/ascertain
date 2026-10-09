import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { getWorld } from "@/fixtures";
import { getAnalysis } from "@/lib/service";
import { ago } from "@/lib/format";

export const metadata: Metadata = { title: "Withheld findings" };
export const dynamic = "force-dynamic";

export default async function WithheldPage() {
  const rows = [];
  for (const f of getWorld().fixtures) {
    const r = (await getAnalysis(f.truth.token.address))!;
    for (const w of r.analysis.withheld) rows.push({ token: r.analysis.token, w, drift: f.drift, at: r.analysis.verifiedAt });
  }
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Public record</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Withheld findings</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
        A finding is published only if every cited fact re-fetches from chain state and matches byte for byte. When one does not, the claim is withheld and listed here with the reason. Nothing is dropped quietly.
      </p>

      <div className="mt-8 space-y-3">
        {rows.map(({ token, w, drift, at }) => (
          <article key={w.id} className="card-solid p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Link href={`/token/${token.symbol}#withheld`} className="mono text-[17px] font-semibold hover:underline">{token.symbol}</Link>
                <span className="text-[14px] text-muted">{w.title}</span>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-dim">
                <span className="mono">{w.ruleVersion}</span><span>{ago(at)}</span>
                <span className="pill pill-nogo !h-[22px] !text-[11px]">withheld</span>
              </div>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{w.withheldReason}</p>
            {drift && <p className="mt-2 flex gap-2 text-[12px] text-dim"><span style={{ color: "var(--wait)" }}><Icon name="alert" size={14} /></span>Injected for demonstration ({drift.kind}): {drift.description}</p>}
          </article>
        ))}
        {rows.length === 0 && <div className="card p-6 text-muted">Nothing is currently withheld.</div>}
      </div>
    </div>
  );
}
