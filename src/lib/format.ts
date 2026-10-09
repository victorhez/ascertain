export const usd = (n: number | null | undefined, compact = false) =>
  n == null ? "n/a" : compact ? compactUsd(n) : `$${Math.round(n).toLocaleString("en-US")}`;

export function compactUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export const num = (n: number | null | undefined) => (n == null ? "n/a" : Math.round(n).toLocaleString("en-US"));
export const pct = (n: number | null | undefined, d = 1) => (n == null ? "n/a" : `${(n * 100).toFixed(d)}%`);
export const short = (a: string, l = 6, r = 4) => (a.length > l + r + 2 ? `${a.slice(0, l)}…${a.slice(-r)}` : a);

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const verdictClass = (v: string) => (v === "GO" ? "pill-go" : v === "WAIT" ? "pill-wait" : "pill-nogo");
export const verdictColor = (v: string) => (v === "GO" ? "var(--go)" : v === "WAIT" ? "var(--wait)" : "var(--nogo)");

export const SCENARIO_LABEL: Record<string, string> = {
  clean: "Organic launch",
  "early-stage": "Early stage",
  concentrated: "Concentrated supply",
  "wash-traded": "Wash-traded volume",
  "sybil-clustered": "Clustered holders",
};
