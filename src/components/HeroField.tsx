"use client";
import { useEffect, useMemo, useState } from "react";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Dot { sx: number; sy: number; mx: number; my: number; kind: "organic" | "sybil"; hub: number }

/**
 * 412 wallets enter. They merge into the 38 that actually exist.
 * Built from the real Mirage fixture numbers (raw holders, cluster sizes).
 */
export function HeroField({ raw, effective, clusterSizes }: { raw: number; effective: number; clusterSizes: number[] }) {
  const [merged, setMerged] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setMerged(true); return; }
    const first = setTimeout(() => setMerged(true), 1400);
    const id = setInterval(() => setMerged((m) => !m), 5200);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const W = 560, H = 380;
  const hubs = useMemo(() => [[150, 110], [380, 96], [440, 250], [220, 262]].slice(0, clusterSizes.length), [clusterSizes.length]);
  const dots = useMemo<Dot[]>(() => {
    const r = lcg(41);
    const out: Dot[] = [];
    const organic = raw - clusterSizes.reduce((a, b) => a + b, 0);
    for (let i = 0; i < organic; i++) {
      const x = 24 + r() * (W - 48), y = 24 + r() * (H - 48);
      out.push({ sx: x, sy: y, mx: x, my: y, kind: "organic", hub: -1 });
    }
    clusterSizes.forEach((n, h) => {
      for (let i = 0; i < n; i++) {
        const sx = 24 + r() * (W - 48), sy = 24 + r() * (H - 48);
        const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * (6 + Math.sqrt(n) * 0.9);
        out.push({ sx, sy, mx: hubs[h][0] + Math.cos(ang) * rad, my: hubs[h][1] + Math.sin(ang) * rad, kind: "sybil", hub: h });
      }
    });
    // Shuffle draw order so clusters are not stacked in a block.
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }, [raw, clusterSizes, hubs]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${raw} holders collapse to ${effective} effective holders`}>
        {merged && hubs.map(([x, y], i) => (
          <g key={i} style={{ opacity: 1, transition: "opacity .8s" }}>
            <circle cx={x} cy={y} r={14 + Math.sqrt(clusterSizes[i]) * 1.5} fill="none" stroke="var(--nogo)" strokeOpacity=".5" strokeDasharray="3 4" />
            <text x={x} y={y - 24 - Math.sqrt(clusterSizes[i]) * 1.4} textAnchor="middle" fontSize="11" fill="var(--nogo)" fontFamily="var(--font-mono)">
              {clusterSizes[i]} wallets · 1 operator
            </text>
          </g>
        ))}
        {dots.map((d, i) => (
          <circle
            key={i} cx={0} cy={0} r={d.kind === "organic" ? 3.1 : 2.3} className="field-dot"
            style={{
              transform: `translate(${merged ? d.mx : d.sx}px, ${merged ? d.my : d.sy}px)`,
              fill: merged ? (d.kind === "organic" ? "var(--accent)" : "var(--nogo)") : "var(--muted)",
              opacity: merged ? (d.kind === "organic" ? 1 : 0.8) : 0.55,
            }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-1">
        <div>
          <div className="eyebrow mb-1">{merged ? "After merging linked wallets" : "What the chain shows"}</div>
          <div className="mono flex items-baseline gap-2 text-[40px] font-semibold leading-none tracking-tight sm:text-[52px]">
            <span style={{ color: merged ? "var(--accent)" : "var(--fg)" }}>{merged ? effective : raw}</span>
            <span className="text-[14px] font-normal tracking-normal text-muted">{merged ? "effective holders" : "holders"}</span>
          </div>
        </div>
        <div className="chip !h-7 backdrop-blur" style={{ background: "color-mix(in oklab, var(--bg) 70%, transparent)" }}>Mirage · simulated launch</div>
      </div>
    </div>
  );
}
