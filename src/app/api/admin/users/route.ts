import { adminJson } from "@/lib/admin/http";
import { listAdminUsers } from "@/lib/admin/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // parseAdminQuery внутри ограничивает q до 100 символов и номер страницы.
  return adminJson(() => listAdminUsers({ q: params.get("q") ?? "", page: params.get("page") ?? "1" }));
}
