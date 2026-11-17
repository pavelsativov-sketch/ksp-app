import { adminJson, readAdminBody } from "@/lib/admin/http";
import { setSubscription } from "@/lib/admin/grants";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminJson(async () => setSubscription(id, await readAdminBody(request)));
}
