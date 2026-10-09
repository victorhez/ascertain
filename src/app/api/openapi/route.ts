import { originOf } from "@/lib/api";
import { openapi } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return Response.json(openapi(originOf(req)), { headers: { "access-control-allow-origin": "*" } });
}
