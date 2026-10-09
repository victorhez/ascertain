import { originOf } from "@/lib/api";
import { x402Config } from "@/x402";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const o = originOf(req);
  const x = x402Config();
  return Response.json(
    {
      name: "Ascertain",
      description:
        "Integrity and readiness verification for Ascend token launches on Elysium. Returns a Go / Wait / No-go verdict with evidence any caller can re-fetch from chain state. AI commentary can only downgrade a verdict.",
      url: o,
      version: "0.1.0",
      documentationUrl: `${o}/agents`,
      provider: { organization: "Ascertain", url: o },
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        { id: "check_token", name: "Check token", description: "Fast verdict: is this launch's holder base and volume organic?", tags: ["verification", "tokens", "elysium", "ascend"], examples: ["Check 0x… before I allocate", "Is MIRA organic?"] },
        { id: "readiness", name: "Ascended readiness", description: "Score breakdown, failed rules, and what would flip the verdict.", tags: ["readiness", "ascended"] },
        { id: "verify_finding", name: "Verify finding", description: "Re-fetch the evidence behind any published finding.", tags: ["evidence", "reproducibility"] },
      ],
      interfaces: {
        rest: { openapi: `${o}/openapi.json`, base: `${o}/v1` },
        mcp: { transport: "stdio", install: "npx -y ascertain-mcp", tools: ["ascertain_check_token", "ascertain_readiness", "ascertain_verify_finding"] },
      },
      payments: {
        protocol: "x402",
        version: 1,
        network: x.network,
        mode: x.mode,
        endpoints: [
          { path: "/v1/token/{address}/readiness", priceUsd: 0.01, freeTier: "25 calls per IP per day" },
          { path: "/v1/token/{address}/integrity", priceUsd: 0.05 },
          { path: "/v1/evidence/{findingId}", priceUsd: 0 },
        ],
      },
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } },
  );
}
