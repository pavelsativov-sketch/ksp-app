import { adminJson, readAdminBody } from "@/lib/admin/http";
import { grantBonusGenerations } from "@/lib/admin/grants";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminJson(async () => grantBonusGenerations(id, await readAdminBody(request)));
}
