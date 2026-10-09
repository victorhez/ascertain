import type { ReactNode } from "react";

type Known = "measured" | "estimated" | "unknown";

const STAGES: { id: string; name: string; status: string; known: { t: string; k: Known }[] }[] = [
  {
    id: "launch",
    name: "Launch",
    status: "Live on testnet",
    known: [
      { t: "Closed hook pool, no bonding curve", k: "measured" },
      { t: "Quote assets: USDC and supported tokenized RWAs", k: "measured" },
      { t: "1% token trading fee, split by creator tier", k: "measured" },
      { t: "Swap fee rate still under development", k: "unknown" },
    ],
  },
  {
    id: "ascended",
    name: "Ascended",
    status: "Criteria published, thresholds internal",
    known: [
      { t: "Market cap, unique holders, volume", k: "estimated" },
      { t: "Checks for concentrated or coordinated accumulation", k: "measured" },
      { t: "Exact thresholds and team discretion", k: "unknown" },
      { t: "Unlocks buybacks and homepage placement", k: "measured" },
    ],
  },
  {
    id: "spot",
    name: "HyperCore spot",
    status: "After Elysium mainnet",
    known: [
      { t: "Separate technical requirements and costs", k: "unknown" },
      { t: "HyperCore precompiles ship about 4 weeks after mainnet", k: "unknown" },
      { t: "No guarantee of listing", k: "unknown" },
    ],
  },
  {
    id: "hip3",
    name: "HIP-3 perps",
    status: "Later stage",
    known: [
      { t: "Separate technical requirements and costs", k: "unknown" },
      { t: "No published timeline", k: "unknown" },
    ],
  },
];

const dot: Record<Known, string> = { measured: "var(--go)", estimated: "var(--wait)", unknown: "var(--dim)" };
const label: Record<Known, string> = { measured: "Documented", estimated: "Ascertain estimate", unknown: "Unknown" };

export function Lifecycle({ activeIndex = 0, children }: { activeIndex?: number; children?: ReactNode }) {
  return (
    <div>
      <ol className="grid gap-4 md:grid-cols-4">
        {STAGES.map((s, i) => {
          const active = i === activeIndex;
          return (
            <li key={s.id} className="card relative p-5" style={active ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent), 0 20px 50px -30px var(--accent)" } : undefined}>
              <div className="flex items-center justify-between">
                <span className="mono text-[11px] text-dim">0{i + 1}</span>
                {active && <span className="pill pill-go !h-5 !px-2 !text-[10.5px]">Current</span>}
              </div>
              <div className="mt-3 text-[18px] font-semibold tracking-tight">{s.name}</div>
              <div className="mt-0.5 text-[12.5px] text-muted">{s.status}</div>
              <ul className="mt-4 space-y-2.5">
                {s.known.map((k) => (
                  <li key={k.t} className="flex gap-2.5 text-[12.5px] leading-snug text-muted">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot[k.k] }} aria-label={label[k.k]} />
                    <span>{k.t}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        {(Object.keys(label) as Known[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot[k] }} />{label[k]}</span>
        ))}
        <span className="text-dim">Roadmap stages are shown with disclosed unknowns, not promises.</span>
      </div>
      {children}
    </div>
  );
}
