/**
 * Брендированный HTML-шаблон транзакционных и сервисных писем Mekty.
 * Чистый модуль (без server-only), безопасный для тестирования и серверной отправки.
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MektyEmailOptions {
  title: string;
  preheader?: string;
  lines?: string[];
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

/** Собирает аккуратное адаптивное HTML-письмо с безопасным экранированием строк. */
export function renderMektyEmail(opts: MektyEmailOptions): string {
  const safeTitle = escapeHtml(opts.title);
  const safePreheader = opts.preheader ? escapeHtml(opts.preheader) : safeTitle;
  const paragraphsHtml =
    opts.bodyHtml ??
    (opts.lines ?? [])
      .map(
        (line) =>
          `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1e293b;">${escapeHtml(line)}</p>`,
      )
      .join("");

  const safeCtaUrl =
    opts.ctaUrl && /^https?:\/\//i.test(opts.ctaUrl.trim())
      ? escapeHtml(opts.ctaUrl.trim())
      : null;

  const ctaBlock =
    opts.ctaLabel && safeCtaUrl
      ? `<div style="margin:24px 0 18px;">
          <a href="${safeCtaUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#6d28d9;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">
            ${escapeHtml(opts.ctaLabel)}
          </a>
        </div>
        <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">
          Если кнопка не открывается, скопируйте ссылку: ${safeCtaUrl}
        </p>`
      : "";

  const footer = escapeHtml(
    opts.footerNote ?? "Mekty — образовательная платформа для педагогов и школ Казахстана.",
  );

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background:linear-gradient(135deg,#4c1d95,#6d28d9);color:#ffffff;">
              <div style="font-size:18px;font-weight:800;letter-spacing:-0.01em;">Mekty</div>
              <div style="margin-top:2px;font-size:12px;color:#ddd6fe;">Помощник педагога · ҚМЖ / КСП · Школа</div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px;">
              <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:800;color:#0f172a;">${safeTitle}</h1>
              ${paragraphsHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
