export function openapi(origin: string) {
  const addr = { name: "address", in: "path", required: true, schema: { type: "string" }, description: "Token address, or a symbol of an indexed launch (LUMEN, RISE, HOLD, WAVE, MIRA)." };
  const intent = { name: "intent", in: "query", schema: { type: "string", enum: ["creator", "trader", "staker"], default: "creator" } };
  const pay402 = { "402": { description: "Payment required (x402). Body lists accepted payment requirements; retry with an X-PAYMENT header.", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentRequired" } } } } };
  return {
    openapi: "3.1.0",
    info: {
      title: "Ascertain API",
      version: "0.1.0",
      description: "Integrity and readiness verdicts for Ascend launches on Elysium. Verdicts are deterministic and versioned; every finding links to re-fetchable evidence. Scores are estimates based on public Ascend criteria, not official Ascend decisions.",
      license: { name: "MIT" },
    },
    servers: [{ url: `${origin}/v1` }],
    paths: {
      "/token/{address}/readiness": {
        get: {
          summary: "Go / Wait / No-go verdict with score breakdown",
          description: "Free tier: 25 calls per IP per day. After that, pay $0.01 per call over x402.",
          parameters: [addr, intent],
          responses: { "200": { description: "Verdict", content: { "application/json": { schema: { $ref: "#/components/schemas/Readiness" } } } }, "404": { description: "Token not indexed" }, ...pay402 },
          "x-payment-info": { protocol: "x402", priceUsd: 0.01, freeTier: 25 },
        },
      },
      "/token/{address}/integrity": {
        get: {
          summary: "Deep report: concentration, funding clusters, wash loops, effective holders",
          parameters: [addr],
          responses: { "200": { description: "Signals" }, ...pay402 },
          "x-payment-info": { protocol: "x402", priceUsd: 0.05 },
        },
      },
      "/evidence/{findingId}": {
        get: {
          summary: "Raw evidence receipts and copy-paste reproduce commands for a finding",
          parameters: [{ name: "findingId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Receipts" }, "404": { description: "Unknown finding" } },
        },
      },
      "/preflight": {
        post: {
          summary: "Verdict for a given intent, with optional advisory commentary",
          description: "Commentary can downgrade the rule verdict to WAIT or NO-GO. It can never upgrade it.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" }, intent: { type: "string", enum: ["creator", "trader", "staker"] } } } } } },
          responses: { "200": { description: "Verdict + commentary" } },
        },
      },
      "/tokens": { get: { summary: "Indexed tokens with verdict summaries", responses: { "200": { description: "List" } } } },
    },
    components: {
      schemas: {
        Verdict: { type: "string", enum: ["GO", "WAIT", "NO-GO"] },
        Readiness: {
          type: "object",
          properties: {
            verdict: { $ref: "#/components/schemas/Verdict" },
            score: { type: "integer", minimum: 0, maximum: 100, description: "Estimate." },
            reasons: { type: "array", items: { type: "string" } },
            breakdown: { type: "array", items: { type: "object" } },
            whatWouldFlipIt: { type: "array", items: { type: "string" } },
            configVersion: { type: "string" },
            inputsDigest: { type: "string", description: "sha256 of the published findings the verdict was computed from." },
            verifiedAt: { type: "string", format: "date-time" },
            findings: { type: "array", items: { type: "object", properties: { id: { type: "string" }, signal: { type: "string" }, status: { enum: ["published", "withheld"] }, evidenceUrl: { type: "string" } } } },
          },
        },
        PaymentRequired: { type: "object", properties: { x402Version: { type: "integer" }, error: { type: "string" }, accepts: { type: "array", items: { type: "object" } } } },
      },
    },
  };
}
