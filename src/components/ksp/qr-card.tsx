"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Link2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

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

export function QrCodeSvg({ text }: { text: string }) {
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
      <p className="px-4 text-center text-xs text-muted-foreground">
        Ссылка слишком длинная для QR-кода — скопируйте её вручную.
      </p>
    );
  }
  if (!svg) {
    return <div style={{ width: SIZE, height: SIZE }} aria-hidden className="animate-pulse rounded bg-muted" />;
  }
  return (
    <div
      className="rounded-lg bg-white p-2"
      // Разметка приходит из qrcode: это наш собственный SVG без внешних данных.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Плашка с QR-кодом, печатью и копированием ссылки. */
export function QrCard({ url, title }: { url: string; title: string }) {
  const { t } = useUiLocale();
  const [copied, setCopied] = useState(false);

  async function download() {
    const svg = await qrToSvg(url);
    const w = window.open("", "_blank", "width=560,height=720");
    if (!w) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
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
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-bold">{t.nav.qrTitle}</p>
      <p className="text-xs text-muted-foreground">{t.nav.qrLead}</p>
      <div className="flex justify-center">
        <QrCodeSvg key={url} text={url} />
      </div>
      <p className="break-all text-center font-mono text-[10px] text-muted-foreground">{url}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void download()} className="flex-1">
          <Printer /> {t.nav.qrPrint}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check /> : <Link2 />} {copied ? t.nav.qrCopied : t.nav.qrCopy}
        </Button>
      </div>
    </div>
  );
}
