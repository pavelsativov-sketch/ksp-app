"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Download,
  Maximize2,
  MessageCircle,
  Printer,
  QrCode,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrCodeSvg } from "@/components/ksp/qr-card";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { Locale } from "@/lib/i18n/dictionaries";
import { buildTelegramUrl, buildWhatsAppUrl } from "@/lib/share/messengers";
import { copyText } from "@/lib/clipboard";

export interface ShareQrActionsProps {
  url: string;
  title: string;
  /** Короткий код задания или квиза (крупно показывается на доске под QR). */
  code?: string;
  /** Готовый текст для WhatsApp / Telegram; если не передан, используется title + url. */
  shareText?: string;
  /** Показывать кнопку «QR на доску» (модальный проектор). */
  showBoardButton?: boolean;
  locale?: Locale;
  compact?: boolean;
}

/**
 * Панель быстрой доставки материалов классу: WhatsApp, Telegram и «QR на доску»
 * с крупным проекционным экраном, скачиванием PNG и печатью.
 */
export function ShareQrActions({
  url,
  title,
  code,
  shareText,
  showBoardButton = true,
  locale,
  compact = false,
}: ShareQrActionsProps) {
  const { locale: uiLocale } = useUiLocale();
  const activeLocale = locale ?? uiLocale;
  const isKk = activeLocale === "kk";
  const [boardOpen, setBoardOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);

  const effectiveText = shareText ?? `${title}\n${url}`;
  const telegramCaption = shareText ? shareText.replace(url, "").trim() || title : title;
  const waHref = buildWhatsAppUrl(effectiveText);
  const tgHref = buildTelegramUrl(url, telegramCaption);

  useEffect(() => {
    if (!boardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBoardOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [boardOpen]);

  async function downloadPng() {
    if (!url || downloadingPng) return;
    setDownloadingPng(true);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qr-${(code || "mekty").toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // ignore
    } finally {
      setDownloadingPng(false);
    }
  }

  async function printBoardQr() {
    if (!url) return;
    const w = window.open("", "_blank", "width=640,height=780");
    if (!w) return;
    try {
      const svg = await QRCode.toString(url, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 360,
        color: { dark: "#000000ff", light: "#ffffffff" },
      });
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      w.document.write(
        `<!doctype html><html lang="${activeLocale}"><head><meta charset="utf-8"><title>${esc(title)}</title>
        <style>body{font:16px system-ui,-apple-system,sans-serif;display:grid;place-content:center;justify-items:center;min-height:100vh;margin:0;gap:16px;color:#000}
        .qr{padding:18px;border:2px solid #e2e8f0;border-radius:18px;background:#fff}
        .code{font-size:44px;font-weight:900;letter-spacing:0.18em}
        .t{font-weight:700;font-size:20px;text-align:center;max-width:440px}
        .u{font-size:12px;color:#475569;word-break:break-all;max-width:440px;text-align:center}</style>
        </head><body>
        <div class="t">${esc(title)}</div>
        <div class="qr">${svg}</div>
        ${code ? `<div class="code">${esc(code)}</div>` : ""}
        <div class="u">${esc(url)}</div>
        </body></html>`,
      );
      w.document.close();
      w.focus();
      w.print();
    } catch {
      w.close();
    }
  }

  const size = compact ? "sm" : "sm";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          size={size}
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
        >
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        </Button>
        <Button
          asChild
          size={size}
          variant="outline"
          className="border-sky-500/40 bg-sky-500/5 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
        >
          <a href={tgHref} target="_blank" rel="noopener noreferrer">
            <Send className="size-3.5" /> Telegram
          </a>
        </Button>
        {showBoardButton && (
          <Button type="button" size={size} variant="outline" onClick={() => setBoardOpen(true)}>
            <QrCode className="size-3.5" /> {isKk ? "Тақтаға QR" : "QR на доску"}
          </Button>
        )}
      </div>

      {boardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isKk ? "Тақтаға арналған QR-код" : "QR-код для интерактивной доски"}
          data-os-fullscreen="true"
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[#0b0d17]/95 p-6 text-white backdrop-blur-sm"
          onClick={() => setBoardOpen(false)}
        >
          <div
            className="relative flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-white/15 bg-[#15182b] p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setBoardOpen(false)}
              aria-label={isKk ? "Жабу" : "Закрыть"}
              className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20"
            >
              <X className="size-5" />
            </button>

            <div className="space-y-1 pr-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">
                {isKk ? "Телефон камерасымен сканерлеңіз" : "Наведите камеру телефона"}
              </p>
              <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{title}</h2>
            </div>

            <div className="w-full max-w-[320px] rounded-2xl bg-white p-4 shadow-xl [&>div]:p-0 [&>div>svg]:w-full">
              <QrCodeSvg key={url} text={url} label={title} />
            </div>

            {code && (
              <div className="rounded-2xl border border-violet-400/30 bg-violet-500/15 px-6 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-200">
                  {isKk ? "Кіру коды" : "Код доступа"}
                </p>
                <p className="mt-0.5 tabular-nums text-4xl font-black tracking-[0.22em] text-white sm:text-5xl">
                  {code}
                </p>
              </div>
            )}

            <p className="max-w-md break-all tabular-nums text-xs text-white/60">{url}</p>

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void copyText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? (isKk ? "Көшірілді" : "Скопировано") : (isKk ? "Сілтемені көшіру" : "Копировать ссылку")}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void downloadPng()} disabled={downloadingPng}>
                <Download className="size-4" /> {isKk ? "PNG жүктеу" : "Скачать PNG"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void printBoardQr()}>
                <Printer className="size-4" /> {isKk ? "Басып шығару" : "Печать"}
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href={tgHref} target="_blank" rel="noopener noreferrer">
                  <Send className="size-4" /> Telegram
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Компактная кнопка-обёртка для вызова полноэкранного QR-проектора. */
export function BoardQrButton({ onClick, locale }: { onClick: () => void; locale?: Locale }) {
  const { locale: uiLocale } = useUiLocale();
  const isKk = (locale ?? uiLocale) === "kk";
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Maximize2 className="size-3.5" /> {isKk ? "Тақтаға QR" : "QR на доску"}
    </Button>
  );
}
