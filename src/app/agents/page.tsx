import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyButton } from "@/components/CopyButton";
import { SectionHead } from "@/components/ui";
import { X402Demo } from "@/components/X402Demo";
import { x402Config } from "@/x402";

export const metadata: Metadata = { title: "Agents: API, MCP and x402" };
export const dynamic = "force-dynamic";

const ENDPOINTS = [
  ["GET", "/v1/token/{address}/readiness", "Verdict + score breakdown", "$0.01 (25 free / IP / day)"],
  ["GET", "/v1/token/{address}/integrity", "Signals, clusters, effective holders", "$0.05"],
  ["GET", "/v1/evidence/{findingId}", "Raw receipts + reproduce commands", "Free"],
  ["POST", "/v1/preflight", "Verdict for an intent, with advisory commentary", "Free"],
  ["GET", "/v1/tokens", "Indexed tokens with verdict summaries", "Free"],
];

export default async function Agents() {
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const x = x402Config();
  const mcp = `claude mcp add ascertain -e ASCERTAIN_URL=${origin} -- npx -y ascertain-mcp`;
  const mcpJson = `{
  "mcpServers": {
    "ascertain": {
      "command": "npx",
      "args": ["-y", "ascertain-mcp"],
      "env": { "ASCERTAIN_URL": "${origin}" }
    }
  }
}`;
  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Agent surface</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">Check before the agent acts.</h1>
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">An MCP server, a REST API with an OpenAPI file, and x402 pay-per-answer. Machine-readable verdicts and evidence for trading and allocation systems.</p>

      <section className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="eyebrow mb-3">MCP · one command</div>
          <pre className="code !text-[12px]">{mcp}</pre>
          <div className="mt-3 flex gap-2"><CopyButton text={mcp} label="Copy command" /></div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">Tools: <span className="mono text-fg">ascertain_check_token</span>, <span className="mono text-fg">ascertain_readiness</span>, <span className="mono text-fg">ascertain_verify_finding</span>. Set <span className="mono text-fg">ASCERTAIN_X402_PRIVATE_KEY</span> to let the server pay 402s automatically.</p>
          <details className="mt-4"><summary className="cursor-pointer text-[13px] text-muted hover:text-fg">Claude Desktop / Cursor config</summary><pre className="code mt-3 !text-[12px]">{mcpJson}</pre></details>
        </div>
        <div className="card p-6">
          <div className="eyebrow mb-3">Discovery</div>
          <ul className="space-y-3 text-[14px]">
            <li className="flex justify-between gap-4"><span className="text-muted">OpenAPI 3.1</span><a className="mono underline underline-offset-4" href="/openapi.json">/openapi.json</a></li>
            <li className="flex justify-between gap-4"><span className="text-muted">Agent card</span><a className="mono underline underline-offset-4" href="/.well-known/agent-card.json">/.well-known/agent-card.json</a></li>
            <li className="flex justify-between gap-4"><span className="text-muted">Payment protocol</span><span className="mono">x402 v1 · {x.network}</span></li>
            <li className="flex justify-between gap-4"><span className="text-muted">Settlement mode</span><span className="mono">{x.mode === "demo" ? "demo (verify only)" : "facilitator"}</span></li>
          </ul>
          <p className="mt-4 text-[12.5px] leading-relaxed text-dim">Pricing is a proposal for the demo. Payment network and facilitator are configurable; see the README for switching from demo to settled mode.</p>
        </div>
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="Try it" title="Watch a paid call, end to end." />
        <X402Demo tokens={["MIRA", "LUMEN", "WAVE", "HOLD", "RISE"]} />
      </section>

      <section className="mt-16">
        <SectionHead eyebrow="REST" title="Endpoints" />
        <div className="card-solid scroll-x p-2 sm:p-4">
          <table className="tbl min-w-[640px]">
            <thead><tr><th>Method</th><th>Path</th><th>Returns</th><th>Price</th></tr></thead>
            <tbody>{ENDPOINTS.map(([m, p, d, c]) => (
              <tr key={p}><td className="mono text-[12px]">{m}</td><td className="mono">{p}</td><td className="text-muted">{d}</td><td className="mono text-[12.5px]">{c}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <pre className="code mt-4">{`curl -s ${origin}/v1/token/MIRA/readiness | jq '{verdict, score, flip: .whatWouldFlipIt}'\n\ncurl -s -X POST ${origin}/v1/preflight \\\n  -H 'content-type: application/json' \\\n  -d '{"token":"WAVE","intent":"trader"}' | jq .verdict`}</pre>
      </section>
    </div>
  );
}
