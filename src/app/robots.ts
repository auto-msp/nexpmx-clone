import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/intelligence", "/solutions/"],
        disallow: ["/api/", "/portal/", "/dashboard", "/clients", "/projects", "/invoices", "/decisions", "/assistant", "/settings", "/login", "/overview"],
      },
    ],
  };
}
