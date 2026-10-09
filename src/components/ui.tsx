import type { ReactNode } from "react";
import { verdictClass, verdictColor } from "@/lib/format";

export function VerdictPill({ verdict, size = "md" }: { verdict: string; size?: "sm" | "md" | "lg" }) {
  const dot = <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />;
  if (size === "lg")
    return (
      <span className={`pill ${verdictClass(verdict)} !h-9 !px-4 !text-[15px] tracking-wide`}>{dot}{verdict}</span>
    );
  return <span className={`pill ${verdictClass(verdict)} ${size === "sm" ? "!h-[22px] !px-2.5 !text-[11px]" : ""}`}>{dot}{verdict}</span>;
}

/** Score ring. Draws once on load. */
export function ScoreRing({ score, verdict, size = 148, partial = false }: { score: number; verdict: string; size?: number; partial?: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Estimated score ${score} out of 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={verdictColor(verdict)} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 60 60)"
          style={{ ["--len" as string]: c, ["--off" as string]: off, animation: "ring 1.2s cubic-bezier(.2,.7,.2,1) both" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[34px] font-semibold leading-none tracking-tight">{score}</span>
        <span className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-muted">{partial ? "partial est." : "est. score"}</span>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "go" | "wait" | "nogo" }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mono mt-1 text-[26px] font-semibold leading-none tracking-tight" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-dim">{sub}</div>}
    </div>
  );
}

export function SectionHead({ eyebrow, title, children, id }: { eyebrow?: string; title: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-8 max-w-2xl scroll-mt-24">
      {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
      <h2 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">{title}</h2>
      {children && <p className="mt-3 text-[16px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function Icon({ name, size = 18 }: { name: "arrow" | "check" | "x" | "chev" | "copy" | "shield" | "layers" | "bolt" | "eye" | "plug" | "alert"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "arrow": return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "check": return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>;
    case "x": return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case "chev": return <svg {...p} className="chev"><path d="m9 6 6 6-6 6" /></svg>;
    case "copy": return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
    case "shield": return <svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "layers": return <svg {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
    case "bolt": return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
    case "eye": return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "plug": return <svg {...p}><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" /></svg>;
    case "alert": return <svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
  }
}
