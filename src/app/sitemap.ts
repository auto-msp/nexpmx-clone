import type { MetadataRoute } from "next";

const BASE = process.env.AUTH_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/intelligence", "/solutions/client-portal", "/terms", "/privacy"];
  return routes.map((r) => ({
    url: `${BASE}${r}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.7,
  }));
}
