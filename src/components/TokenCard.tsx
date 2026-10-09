import Link from "next/link";
import { SCENARIO_LABEL, compactUsd, num } from "@/lib/format";
import type { summarize } from "@/lib/service";
import { VerdictPill } from "./ui";

type Row = ReturnType<typeof summarize>;

export function TokenCard({ t, delay = 0 }: { t: Row; delay?: number }) {
  const ratio = t.rawHolders && t.effectiveHolders ? t.effectiveHolders / t.rawHolders : null;
  return (
    <Link href={`/token/${t.symbol}`} className="card rise group relative flex flex-col p-5 transition-colors hover:border-line2" style={{ ["--d" as string]: `${delay}s` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[22px] font-semibold tracking-tight">{t.symbol}</div>
          <div className="text-[13px] text-muted">{t.name}</div>
        </div>
        <VerdictPill verdict={t.verdict} />
      </div>
      <p className="mt-4 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-muted">{t.summary}</p>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Cell label="Holders" value={t.rawHolders == null ? "n/a" : `${num(t.rawHolders)}`} sub={t.effectiveHolders != null ? `${num(t.effectiveHolders)} effective` : "unverified"} warn={ratio != null && ratio < 0.5} />
        <Cell label="Market cap" value={t.marketCapUsd == null ? "n/a" : compactUsd(t.marketCapUsd)} />
        <Cell label="Est. score" value={String(t.score)} />
      </div>
      <div className="mt-4 flex items-center justify-between text-[11.5px] text-dim">
        <span>{SCENARIO_LABEL[t.scenario ?? ""] ?? "Live token"}</span>
        <span className="mono">{t.withheld ? `${t.withheld} withheld` : "all verified"}</span>
      </div>
    </Link>
  );
}

function Cell({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-dim">{label}</div>
      <div className="mono mt-0.5 text-[16px] font-semibold">{value}</div>
      {sub && <div className="text-[11px]" style={{ color: warn ? "var(--nogo)" : "var(--dim)" }}>{sub}</div>}
    </div>
  );
}
