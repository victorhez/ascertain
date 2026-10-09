import { json, preflight, rateLimit, problem } from "@/lib/api";
import { listTokens } from "@/lib/service";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const rl = rateLimit(req, 120);
  if (!rl.ok) return problem(429, "rate_limited");
  return json({ tokens: await listTokens() }, { headers: rl.headers });
}
