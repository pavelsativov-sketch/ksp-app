import type { MetadataRoute } from "next";
import { isPublicSite, publicRoutes, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicSite) return [];
  return publicRoutes.map((path) => ({
    url: new URL(path, siteUrl).href,
    changeFrequency: path === "/library" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
