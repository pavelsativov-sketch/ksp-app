import type { MetadataRoute } from "next";
import { isPublicSite, siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isPublicSite) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/profile", "/textbooks", "/plans/", "/quiz/"] },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
