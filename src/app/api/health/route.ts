import { x402Config } from "@/x402";
import { defaultConfig } from "@/engine/config";

export const dynamic = "force-dynamic";

export function GET() {
  const x = x402Config();
  return Response.json({ status: "ok", service: "ascertain", thresholds: defaultConfig.version, x402: { mode: x.mode, network: x.network } });
}
