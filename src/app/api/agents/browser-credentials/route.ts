import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  saveCredentials,
  deleteCredentials,
  listCredentialDomains,
  KNOWN_LOGIN_SITES,
} from "@/lib/agents/browser-autologin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — список доменов с сохранёнными учётными данными */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const domains = await listCredentialDomains(auth.user.id);
  const sites = domains.map((domain) => ({
    domain,
    name: KNOWN_LOGIN_SITES[domain]?.name ?? domain,
  }));
  return NextResponse.json({ sites, knownSites: Object.entries(KNOWN_LOGIN_SITES).map(([domain, s]) => ({ domain, name: s.name })) });
}

/** POST — сохранить учётные данные для домена */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { domain?: string; username?: string; password?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const domain = (body.domain ?? "").trim().toLowerCase().replace(/^www\./, "");
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!domain || domain.length > 200) return NextResponse.json({ error: "Укажите домен" }, { status: 400 });
  if (!username) return NextResponse.json({ error: "Укажите логин" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Укажите пароль" }, { status: 400 });

  await saveCredentials(auth.user.id, domain, username, password);
  return NextResponse.json({ ok: true, domain });
}

/** DELETE — удалить учётные данные для домена */
export async function DELETE(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!domain) return NextResponse.json({ error: "Укажите domain" }, { status: 400 });

  await deleteCredentials(auth.user.id, domain);
  return NextResponse.json({ ok: true });
}
