"use client";
import { useMemo, useState } from "react";

interface Props {
  defaultDailyVolume: number;
  fee: number;
  deployerShare: number;
  approvedShare: number;
  referralShare: number;
}

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`);

/**
 * Creator revenue and listing-reserve planner. Every number is an assumption derived from the
 * fee splits Ascend has published; nothing here is a forecast or a guarantee.
 */
export function Planner({ defaultDailyVolume, fee, deployerShare, approvedShare, referralShare }: Props) {
  const [volume, setVolume] = useState(Math.max(1000, Math.round(defaultDailyVolume / 1000) * 1000));
  const [tier, setTier] = useState<"deployer" | "approved">("deployer");
  const [reservePct, setReservePct] = useState(30);
  const [target, setTarget] = useState(50000);
  const [horizon, setHorizon] = useState(180);
  const [referred, setReferred] = useState(0);

  const r = useMemo(() => {
    const share = tier === "deployer" ? deployerShare : approvedShare;
    const dailyFee = volume * fee;
    const creator = dailyFee * share;
    const reserve = creator * (reservePct / 100);
    const take = creator - reserve;
    const days = reserve > 0 ? Math.ceil(target / reserve) : Infinity;
    const series = Array.from({ length: horizon + 1 }, (_, d) => reserve * d);
    return { share, dailyFee, creator, reserve, take, days, series };
  }, [volume, tier, reservePct, target, horizon, deployerShare, approvedShare, fee]);

  const W = 560, H = 150, max = Math.max(target * 1.1, r.series[r.series.length - 1] || 1);
  const pts = r.series.map((v, i) => `${(i / horizon) * (W - 8) + 4},${H - 6 - (v / max) * (H - 14)}`);
  const ty = H - 6 - (target / max) * (H - 14);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="card space-y-6 p-6">
        <Field label="Average daily volume" value={money(volume)}>
          <input type="range" min={1000} max={500000} step={1000} value={volume} onChange={(e) => setVolume(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Average daily volume" />
        </Field>
        <div>
          <div className="mb-2 text-[12.5px] text-muted">Creator tier</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Creator tier">
            {([["deployer", `Default deployer · ${deployerShare * 100}%`], ["approved", `Approved creator or takeover · ${approvedShare * 100}%`]] as const).map(([k, l]) => (
              <button key={k} role="radio" aria-checked={tier === k} onClick={() => setTier(k)} className="btn !h-auto !whitespace-normal py-2.5 text-left text-[12.5px]" style={tier === k ? { borderColor: "var(--fg)" } : undefined}>{l}</button>
            ))}
          </div>
        </div>
        <Field label="Fee share set aside for a HyperCore listing" value={`${reservePct}%`}>
          <input type="range" min={0} max={100} step={5} value={reservePct} onChange={(e) => setReservePct(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Reserve percentage" />
        </Field>
        <Field label="Listing budget you want to reach (your assumption)" value={money(target)}>
          <input type="range" min={5000} max={500000} step={5000} value={target} onChange={(e) => setTarget(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Listing budget" />
        </Field>
        <Field label="Referred swap fees (optional)" value={`${money(referred)} / day`}>
          <input type="range" min={0} max={20000} step={500} value={referred} onChange={(e) => setReferred(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Referred swap fees per day" />
        </Field>
        <p className="text-[11.5px] leading-relaxed text-dim">
          Assumptions from Ascend docs: 1% token trading fee, default deployer {deployerShare * 100}%, approved creator or takeover {approvedShare * 100}%, referrals {referralShare * 100}% of referred users&apos; swap fees. The swap-fee rate is still under development. HyperCore listing costs are not published, so the budget is yours to set.{" "}
          <a className="underline underline-offset-4" href="https://ascendlaunch.gitbook.io/docs" target="_blank" rel="noreferrer">Ascend docs</a>
        </p>
      </div>

      <div className="card p-6">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Out label="Trading fees / day" v={money(r.dailyFee)} />
          <Out label="Creator share / day" v={money(r.creator)} />
          <Out label="Reserve / day" v={money(r.reserve)} />
          <Out label="Take-home / day" v={money(r.take + referred * referralShare)} />
        </div>
        <div className="mt-7 border-t border-line pt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted">Reserve accumulation over {horizon} days</span>
            <span className="mono text-[13px]">{Number.isFinite(r.days) ? `reaches ${money(target)} in ~${r.days}d` : "no reserve set"}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Cumulative reserve over time">
            <line x1="4" x2={W - 4} y1={ty} y2={ty} stroke="var(--wait)" strokeDasharray="4 4" />
            <text x={W - 6} y={ty - 6} textAnchor="end" fontSize="10.5" fill="var(--wait)" fontFamily="var(--font-mono)">budget {money(target)}</text>
            <polyline points={`4,${H - 6} ${pts.join(" ")}`} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <polygon points={`4,${H - 6} ${pts.join(" ")} ${W - 4},${H - 6}`} fill="var(--accent)" opacity=".1" />
          </svg>
          <input type="range" min={30} max={365} step={30} value={horizon} onChange={(e) => setHorizon(+e.target.value)} className="mt-2 w-full accent-[var(--accent)]" aria-label="Horizon in days" />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-dim">A model, not a forecast. Volume is the lever Ascertain measures: only organic volume should be assumed, and wash volume would inflate fees you cannot count on.</p>
      </div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[12.5px]"><span className="text-muted">{label}</span><span className="mono text-fg">{value}</span></div>
      {children}
    </div>
  );
}

const Out = ({ label, v }: { label: string; v: string }) => (
  <div><div className="text-[11.5px] text-muted">{label}</div><div className="mono mt-1 text-[22px] font-semibold tracking-tight">{v}</div></div>
);
