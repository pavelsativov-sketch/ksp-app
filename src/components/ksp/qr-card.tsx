"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Link2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { Locale } from "@/lib/i18n/dictionaries";
import { copyText } from "@/lib/clipboard";

/**
 * QR-плашка на план.
 *
 * Учитель печатает план и кладёт рядом QR-код: ученик, коллега или родитель
 * открывает телефоном и сразу видит материал — без регистрации и ввода кода.
 * Работает и для приватных планов, потому что ссылка ведёт на конкретный id:
 * доступ проверяет сервер, а плашка — лишь способ доставки ссылки.
 *
 * Кодирование QRdelegated библиотеке `qrcode`: самописный кодировщик нечитаем
 * камерой, а проверить это без телефона невозможно.
 */
const SIZE = 220;

/** SVG-строка QR-кода. Бросает ошибку только при слишком длинных данных. */
function qrToSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: SIZE,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
}

export function QrCodeSvg({
  text,
  label = "QR code",
  failedMessage = "Ссылка слишком длинная для создания QR-кода",
}: {
  text: string;
  label?: string;
  failedMessage?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Генерация идёт в эффекте, а не в queueMicrotask из тела рендера:
  // микротаска успевала завершиться после размонтирования, и React ругался
  // «state update on a component that hasn't mounted yet». Флаг alive гасит
  // результат, если компонент успели закрыть. Сброс при смене текста делает
  // call-site через key={text} (remount) — setState в теле эффекта запрещён
  // правилом react-hooks/set-state-in-effect.
  useEffect(() => {
    let alive = true;
    qrToSvg(text)
      .then((out) => {
        if (alive) setSvg(out);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [text]);

  if (failed) {
    return (
      <p role="status" className="px-4 text-center text-xs text-muted-foreground">{failedMessage}</p>
    );
  }
  if (!svg) {
    return <div style={{ height: SIZE }} aria-hidden className="aspect-square w-full max-w-[220px] animate-pulse rounded bg-muted" />;
  }
  return (
    <div
      role="img"
      aria-label={label}
      className="max-w-full rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:max-w-full"
      // Разметка приходит из qrcode: это наш собственный SVG без внешних данных.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Плашка с QR-кодом, печатью и копированием ссылки. */
export function QrCard({ url, title, heading, description, locale }: {
  url: string;
  title: string;
  heading?: string;
  description?: string;
  locale?: Locale;
}) {
  const { locale: uiLocale, t } = useUiLocale();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [printFailed, setPrintFailed] = useState(false);
  const activeLocale = locale ?? uiLocale;
  const qrLabel = `${heading ?? t.nav.qrTitle}: ${title}`;
  const qrFailedMessage = activeLocale === "kk"
    ? "QR-код жасалмады. Сілтемені қолмен көшіріңіз."
    : "Не удалось создать QR-код. Скопируйте ссылку вручную.";
  const copyFailedMessage = activeLocale === "kk" ? "Сілтемені көшіру мүмкін болмады." : "Не удалось скопировать ссылку.";
  const printFailedMessage = activeLocale === "kk" ? "Басып шығару терезесін ашу мүмкін болмады." : "Не удалось открыть окно печати.";

  async function download() {
    const w = window.open("", "_blank", "width=560,height=720");
    if (!w) {
      setPrintFailed(true);
      return;
    }
    setPrintFailed(false);
    try {
    const svg = await qrToSvg(url);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(
      `<!doctype html><html lang="${locale ?? "ru"}"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body{font:14px system-ui,-apple-system,sans-serif;display:grid;place-content:center;justify-items:center;height:100vh;margin:0;gap:14px;color:#000}
        .qr{padding:14px;border:1px solid #ddd;border-radius:12px;background:#fff}
        .t{font-weight:700;font-size:15px;text-align:center;max-width:300px}
        .u{font-size:10px;color:#666;word-break:break-all;max-width:300px;text-align:center}
        @media print{body{height:auto}.no-print{display:none}}
      </style></head><body>
      <div class="qr">${svg}</div>
      <div class="t">${esc(title)}</div>
      <div class="u">${esc(url)}</div>
      </body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
    } catch {
      w.close();
      setPrintFailed(true);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-bold">{heading ?? t.nav.qrTitle}</p>
      <p className="text-xs text-muted-foreground">{description ?? t.nav.qrLead}</p>
      <div className="flex justify-center">
        <QrCodeSvg key={url} text={url} label={qrLabel} failedMessage={qrFailedMessage} />
      </div>
      <p className="break-all text-center font-mono text-[10px] text-muted-foreground">{url}</p>
      {copyFailed && <p role="alert" className="text-center text-xs text-destructive">{copyFailedMessage}</p>}
      {printFailed && <p role="alert" className="text-center text-xs text-destructive">{printFailedMessage}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="sm" variant="outline" onClick={() => void download()} className="min-h-11 flex-1">
          <Printer /> {t.nav.qrPrint}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 flex-1"
          onClick={() => {
            void copyText(url).then(() => {
              setCopyFailed(false);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }).catch(() => setCopyFailed(true));
          }}
        >
          {copied ? <Check /> : <Link2 />} {copied ? t.nav.qrCopied : t.nav.qrCopy}
        </Button>
      </div>
    </div>
  );
}
