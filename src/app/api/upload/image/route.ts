import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не приложен" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ, макс 5 МБ)` },
      { status: 400 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Тип не поддерживается: ${file.type}. Разрешено: png/jpg/webp/gif/svg` },
      { status: 400 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Use admin client so we don't depend on storage RLS being applied yet.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("plan-images")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[upload/image] storage error", upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data } = admin.storage.from("plan-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
