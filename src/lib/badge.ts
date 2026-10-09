import { MARK_PATH, MARK_VIEWBOX } from "./brand";
import type { Verdict } from "@/engine/types";

const COLORS: Record<Verdict | "STALE", string> = { GO: "#16a34a", WAIT: "#d97706", "NO-GO": "#dc2626", STALE: "#6b7280" };

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function badgeSvg(o: { symbol: string; verdict: Verdict; verifiedAt: string; now?: number; staleAfterMs: number; simulated?: boolean }): string {
  const age = (o.now ?? Date.now()) - new Date(o.verifiedAt).getTime();
  const stale = age > o.staleAfterMs;
  const color = stale ? COLORS.STALE : COLORS[o.verdict];
  const label = stale ? `STALE · ${ago(age)}` : `${o.verdict} · ${ago(age)}`;
  const left = `ascertain · ${o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;
  const lw = 34 + left.length * 6.1;
  const rw = 18 + label.length * 6.4;
  const w = Math.round(lw + rw);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28" role="img" aria-label="Ascertain ${o.symbol}: ${label}">
<title>Ascertain ${o.symbol}: ${label}${o.simulated ? " (simulated launch)" : ""}</title>
<rect width="${w}" height="28" rx="7" fill="#0b0d10"/>
<rect x="${lw}" width="${w - lw}" height="28" rx="7" fill="${color}"/>
<rect x="${lw}" width="8" height="28" fill="${color}"/>
<svg x="9" y="6" width="16" height="16" viewBox="${MARK_VIEWBOX}"><path d="${MARK_PATH}" fill="#fff"/></svg>
<g font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="11.5" font-weight="600" fill="#fff">
<text x="31" y="18">${left}</text>
<text x="${lw + 10}" y="18">${label}</text>
</g></svg>`;
}
