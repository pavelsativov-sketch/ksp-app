import { adminJson } from "@/lib/admin/http";
import { getAdminOverview } from "@/lib/admin/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return adminJson(getAdminOverview);
}
