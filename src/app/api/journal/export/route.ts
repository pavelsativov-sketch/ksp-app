import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/api-handler";
import { buildJournalDocx, exportJournalToCsv, getJournalState } from "@/lib/journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiAuth(
  {
    rateLimit: { prefix: "journal:export", limit: 30, windowMs: 60_000 },
    errorMessage: "Не удалось выгрузить электронный журнал",
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "docx" ? "docx" : "csv";
    const className = url.searchParams.get("className") || undefined;
    const subject = url.searchParams.get("subject") || undefined;
    const lang: "ru" | "kz" = url.searchParams.get("lang") === "kz" ? "kz" : "ru";

    const state = await getJournalState(user.id, {
      syncHomework: false,
      className,
      subject,
    });

    const slug = `${className || "all"}-${subject || "journal"}`
      .replace(/[^\p{L}\p{N}_\- ]/gu, "_")
      .slice(0, 60);

    if (format === "docx") {
      const buf = await buildJournalDocx(state, {
        className,
        subject,
        teacherName: user.fullName ?? user.email,
        lang,
      });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation".replace(
            "presentationml.presentation",
            "wordprocessingml.document",
          ),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`journal-${slug}.docx`)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = exportJournalToCsv(state, { className, subject, lang });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`journal-${slug}.csv`)}`,
        "Cache-Control": "no-store",
      },
    });
  },
);
