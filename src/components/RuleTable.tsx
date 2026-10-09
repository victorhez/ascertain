import type { RuleResult } from "@/engine/types";
import { compactUsd, num, pct } from "@/lib/format";

function show(r: RuleResult, x: number | null): string {
  if (x == null) return "unverified";
  if (r.unit === "usd") return compactUsd(x);
  if (r.unit === "pct") return pct(x);
  if (r.unit === "ratio") return x.toFixed(2);
  return num(x);
}

const STATUS: Record<RuleResult["status"], { label: string; cls: string; color: string }> = {
  pass: { label: "Pass", cls: "pill-go", color: "var(--go)" },
  fail: { label: "Below bar", cls: "pill-wait", color: "var(--wait)" },
  "hard-fail": { label: "Hard fail", cls: "pill-nogo", color: "var(--nogo)" },
  unverified: { label: "Unverified", cls: "pill-mute", color: "var(--dim)" },
};

export function RuleTable({ rules }: { rules: RuleResult[] }) {
  return (
    <div className="scroll-x">
      <table className="tbl min-w-[640px]">
        <thead>
          <tr><th>Rule</th><th>Measured</th><th>Estimated bar</th><th className="w-[26%]">Fit</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const s = STATUS[r.status];
            return (
              <tr key={r.id}>
                <td>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11.5px] text-dim">{r.kind === "growth" ? "growth" : "integrity"} · weight {Math.round(r.weight * 100)}%</div>
                </td>
                <td className="mono">{show(r, r.value)}</td>
                <td className="mono text-muted">
                  {r.op} {show(r, r.threshold)}
                  {r.hardThreshold !== undefined && <div className="text-[11px] text-dim">hard {r.op === ">=" ? "<" : ">"} {show(r, r.hardThreshold)}</div>}
                </td>
                <td>
                  <div className="h-2 rounded-full" style={{ background: "color-mix(in oklab, var(--fg) 8%, transparent)" }}>
                    <div className="bar-grow h-2 rounded-full" style={{ width: `${Math.max(r.status === "unverified" ? 0 : 3, r.subScore * 100)}%`, background: s.color }} />
                  </div>
                </td>
                <td><span className={`pill ${s.cls} !h-[22px] !text-[11px]`}>{s.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
