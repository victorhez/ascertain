import { compactUsd, pct, short } from "@/lib/format";

/* ------------------------------------------------------------------ concentration */

export function ConcentrationChart({ value }: { value: any }) {
  const rows: { address: string; share: number }[] = value.topHolders ?? [];
  const max = Math.max(0.0001, ...rows.map((r) => r.share));
  return (
    <div>
      <div className="grid grid-cols-3 gap-4 border-b border-line pb-5">
        <Mini label="Top 1" v={pct(value.top1)} />
        <Mini label="Top 5" v={pct(value.top5)} />
        <Mini label="Top 10" v={pct(value.top10)} />
        <Mini label="HHI" v={Number(value.hhi).toFixed(3)} />
        <Mini label="Gini" v={Number(value.gini).toFixed(2)} />
        <Mini label="Holders" v={String(value.holders)} />
      </div>
      <ol className="mt-5 space-y-2" aria-label="Top ten holders by share of circulating supply">
        {rows.map((r, i) => (
          <li key={r.address} className="grid grid-cols-[22px_1fr_56px] items-center gap-3 text-[12.5px]">
            <span className="mono text-dim">{i + 1}</span>
            <div className="relative h-[22px] overflow-hidden rounded-md" style={{ background: "color-mix(in oklab, var(--fg) 5%, transparent)" }}>
              <div className="bar-grow absolute inset-y-0 left-0 rounded-md" style={{ width: `${(r.share / max) * 100}%`, background: i === 0 && r.share > 0.1 ? "var(--nogo)" : "var(--accent)", opacity: i === 0 && r.share > 0.1 ? 0.85 : 0.75, ["--d" as string]: `${0.05 * i}s` }} />
              <span className="mono absolute inset-y-0 left-2.5 flex items-center text-[11px] text-fg mix-blend-normal">{short(r.address, 6, 4)}</span>
            </div>
            <span className="mono text-right">{pct(r.share)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[12px] text-dim">Share of circulating supply. Pool and burn addresses are excluded.</p>
    </div>
  );
}

const Mini = ({ label, v }: { label: string; v: string }) => (
  <div>
    <div className="text-[11.5px] text-muted">{label}</div>
    <div className="mono mt-0.5 text-[19px] font-semibold tracking-tight">{v}</div>
  </div>
);

/* ------------------------------------------------------------------ funnel */

export function Funnel({ raw, effective }: { raw: number; effective: number }) {
  const ratio = raw ? effective / raw : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px] text-muted"><span>Raw holders</span><span className="mono text-fg">{raw.toLocaleString("en-US")}</span></div>
      <div className="mt-1.5 h-3 rounded-full" style={{ background: "color-mix(in oklab, var(--fg) 18%, transparent)" }} />
      <div className="mt-4 flex items-baseline justify-between text-[12.5px] text-muted"><span>Effective holders</span><span className="mono text-fg">{effective.toLocaleString("en-US")}</span></div>
      <div className="mt-1.5 h-3 rounded-full" style={{ background: "color-mix(in oklab, var(--fg) 8%, transparent)" }}>
        <div className="bar-grow h-3 rounded-full" style={{ width: `${Math.max(2, ratio * 100)}%`, background: ratio < 0.5 ? "var(--nogo)" : ratio < 0.75 ? "var(--wait)" : "var(--accent)" }} />
      </div>
      <div className="mt-2 text-[12px] text-dim">{pct(ratio, 0)} of raw holders are independent</div>
    </div>
  );
}

/* ------------------------------------------------------------------ volume */

export function VolumeChart({ days }: { days: { day: number; totalUsd: number; inflatedUsd: number; organicUsd: number; effectiveHolders: number; volumePerEffective: number }[] }) {
  const W = 640, H = 220, pl = 44, pb = 26, pt = 10;
  const max = Math.max(1, ...days.map((d) => d.totalUsd));
  const bw = (W - pl - 8) / Math.max(1, days.length);
  const y = (v: number) => pt + (H - pb - pt) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const vpe = days.map((d) => d.volumePerEffective);
  const vmax = Math.max(1, ...vpe);
  const line = days.map((d, i) => `${i ? "L" : "M"}${(pl + bw * i + bw / 2).toFixed(1)} ${(pt + (H - pb - pt) * (1 - d.volumePerEffective / vmax)).toFixed(1)}`).join("");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily traded volume, split into organic and inflated, with volume per effective wallet">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pl} x2={W - 4} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--dim)" fontFamily="var(--font-mono)">{compactUsd(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pl + bw * i + bw * 0.14;
          const w = bw * 0.72;
          return (
            <g key={d.day}>
              <title>{`Day ${d.day + 1}: ${compactUsd(d.totalUsd)} total · ${compactUsd(d.inflatedUsd)} inflated · ${d.effectiveHolders} effective holders`}</title>
              <rect x={x} y={y(d.organicUsd)} width={w} height={Math.max(0, H - pb - y(d.organicUsd))} rx="3" fill="var(--accent)" opacity=".8" />
              <rect x={x} y={y(d.totalUsd)} width={w} height={Math.max(0, y(d.organicUsd) - y(d.totalUsd))} rx="3" fill="var(--nogo)" opacity=".85" />
              <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--dim)" fontFamily="var(--font-mono)">{d.day + 1}</text>
            </g>
          );
        })}
        <path d={line} fill="none" stroke="var(--fg)" strokeWidth="1.6" strokeDasharray="4 3" opacity=".7" />
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <Key c="var(--accent)" l="Organic volume" />
        <Key c="var(--nogo)" l="Inflated (wash or coordinated wallets)" />
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-fg/70" />Volume per effective wallet (peak {compactUsd(vmax)})</span>
      </div>
    </div>
  );
}

const Key = ({ c, l }: { c: string; l: string }) => (
  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />{l}</span>
);

/* ------------------------------------------------------------------ cluster graph */

export function ClusterGraph({ clusters, organic, washWallets }: { clusters: { id: string; size: number; root: string; hops: number }[]; organic: number; washWallets: number }) {
  const W = 640, H = 330;
  const sorted = [...clusters].sort((a, b) => b.size - a.size);
  // Pack clusters in rows.
  const nodes: { c: (typeof sorted)[number]; x: number; y: number; r: number }[] = [];
  let x = 20, y = 20, rowH = 0;
  for (const c of sorted) {
    const r = 16 + Math.sqrt(c.size) * 3.4;
    if (x + r * 2 > W - 20) { x = 20; y += rowH + 18; rowH = 0; }
    nodes.push({ c, x: x + r, y: y + r, r });
    x += r * 2 + 18; rowH = Math.max(rowH, r * 2);
  }
  const blobsBottom = nodes.length ? Math.max(...nodes.map((n) => n.y + n.r)) : 0;
  const stripY = Math.min(H - 34, Math.max(blobsBottom + 56, 150));
  const dots = Math.min(organic, 96);

  const sunflower = (n: number, i: number, r: number) => {
    const a = i * 2.399963, rr = r * Math.sqrt((i + 0.5) / n);
    return [Math.cos(a) * rr, Math.sin(a) * rr] as const;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${clusters.length} linked wallet groups and ${organic} independent holders`}>
        {nodes.map(({ c, x, y, r }) => (
          <g key={c.id}>
            <title>{`${c.id}: ${c.size} wallets linked by funding source (root ${short(c.root)}, ${c.hops} hop${c.hops > 1 ? "s" : ""})`}</title>
            <circle cx={x} cy={y} r={r + 5} fill="var(--nogo)" opacity=".07" />
            <circle cx={x} cy={y} r={r + 5} fill="none" stroke="var(--nogo)" strokeOpacity=".45" strokeDasharray="3 4" />
            {Array.from({ length: Math.min(c.size, 120) }, (_, i) => {
              const [dx, dy] = sunflower(Math.min(c.size, 120), i, r);
              return <circle key={i} cx={x + dx} cy={y + dy} r={2.3} fill="var(--nogo)" opacity=".85" />;
            })}
            <text x={x} y={y + r + 18} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">{c.id} · {c.size}</text>
          </g>
        ))}
        {!nodes.length && (
          <text x={W / 2} y={80} textAnchor="middle" fontSize="13" fill="var(--muted)">No wallet group shares a funding source above the minimum size.</text>
        )}
        <line x1="20" x2={W - 20} y1={stripY - 22} y2={stripY - 22} stroke="var(--line)" />
        <text x="20" y={stripY - 6} fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">{organic} independent holders</text>
        {Array.from({ length: dots }, (_, i) => (
          <circle key={i} cx={20 + (i % 48) * ((W - 40) / 48) + 5} cy={stripY + 12 + Math.floor(i / 48) * 14} r="3.3" fill="var(--accent)" opacity=".85" />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <Key c="var(--nogo)" l="Wallets linked by funding source (one operator pattern)" />
        <Key c="var(--accent)" l="Independent holders" />
        {washWallets > 0 && <span>{washWallets} wallets also show round-trip flow</span>}
      </div>
    </div>
  );
}
