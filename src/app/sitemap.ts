import type { MetadataRoute } from "next";
import { SPECS } from "@/fixtures/scenarios";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pages = ["", "/tokens", "/methodology", "/agents", "/withheld", "/submission"].map((p) => ({ url: `${site}${p}`, changeFrequency: "daily" as const }));
  const tokens = SPECS.flatMap((s) => [`/token/${s.symbol}`, `/creator/${s.symbol}`].map((p) => ({ url: `${site}${p}`, changeFrequency: "daily" as const })));
  return [...pages, ...tokens];
}
