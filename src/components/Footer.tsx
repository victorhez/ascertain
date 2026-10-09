import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-28 border-t border-line">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted">
            The integrity and readiness layer for Ascend launches on Elysium. Evidence first, rules in code, AI only advises.
          </p>
          <p className="mt-6 text-[12px] leading-relaxed text-dim">
            Verdicts are estimates from public Ascend criteria, not official Ascend decisions and not financial advice. Findings describe observable on-chain patterns only. Ascertain never holds funds or keys. Unaudited.
          </p>
        </div>
        <FooterCol title="Product" items={[["Tokens", "/tokens"], ["Withheld list", "/withheld"], ["Creator dashboard", "/creator/MIRA"], ["Revenue planner", "/creator/LUMEN#planner"]]} />
        <FooterCol title="Build" items={[["API and MCP", "/agents"], ["OpenAPI", "/openapi.json"], ["Agent card", "/.well-known/agent-card.json"], ["Embed a badge", "/token/LUMEN#badge"]]} />
        <FooterCol title="Trust" items={[["Methodology", "/methodology"], ["Known blind spots", "/methodology#blind-spots"], ["Thresholds (estimates)", "/methodology#thresholds"], ["Health", "/api/health"]]} />
      </div>
      <div className="hairline">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-5 text-[12px] text-dim sm:flex-row sm:justify-between sm:px-6">
          <span>© 2026 Ascertain. MIT licensed. Built for the Ascend Builder Program, Track 1.</span>
          <span>Not affiliated with Kinetiq or Ascend.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow mb-4">{title}</div>
      <ul className="space-y-2.5 text-[14px]">
        {items.map(([l, h]) => (
          <li key={l}><Link href={h} className="text-muted transition-colors hover:text-fg">{l}</Link></li>
        ))}
      </ul>
    </div>
  );
}
