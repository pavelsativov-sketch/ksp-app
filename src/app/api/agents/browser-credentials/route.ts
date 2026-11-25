import { NextResponse } from "next/server";
import { z } from "zod";
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

const credentialsSchema = z.object({
  domain: z.string().trim().toLowerCase().min(1, "Укажите домен").max(253, "Слишком длинный домен")
    .transform((value) => value.replace(/^www\./, "")),
  username: z.string().trim().min(1, "Укажите логин").max(256, "Слишком длинный логин"),
  password: z.string().min(1, "Укажите пароль").max(1024, "Слишком длинный пароль"),
});

/** POST — сохранить учётные данные для домена */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
  }
  const { domain, username, password } = parsed.data;
  if (!domain) return NextResponse.json({ error: "Укажите домен" }, { status: 400 });

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
