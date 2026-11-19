"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/i18n/dictionaries";
import { buildTelegramUrl, buildWhatsAppUrl, parentReportMessage } from "@/lib/share/messengers";
import { copyText } from "@/lib/clipboard";

export function ParentShareCard({
  studentName,
  totalAssignments,
  average,
  best,
  worst,
  recentTitles,
  locale = "ru",
}: {
  studentName: string;
  totalAssignments: number;
  average: number;
  best: number;
  worst: number;
  recentTitles: string[];
  locale?: Locale;
}) {
  const isKk = locale === "kk";
  const [text, setText] = useState(() =>
    parentReportMessage({
      studentName,
      totalAssignments,
      average,
      best,
      worst,
      recentTitles,
      locale,
    }),
  );
  const [copied, setCopied] = useState(false);

  const waHref = buildWhatsAppUrl(text);
  const tgHref = buildTelegramUrl("https://ksp-app-pi.vercel.app", text);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {isKk ? "Ата-анаға хабарлама жіберу" : "Сводка для родителя в WhatsApp / Telegram"}
        </CardTitle>
        <CardDescription>
          {isKk
            ? "Мәтінді қалауыңызша өңдеп, бір батырмамен ата-анаға жіберіңіз."
            : "При необходимости поправьте формулировку и отправьте родителю в один клик."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={isKk ? "Ата-анаға арналған мәтін" : "Текст сводки для родителя"}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
          >
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" /> {isKk ? "WhatsApp-қа жіберу" : "Отправить в WhatsApp"}
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-sky-500/40 bg-sky-500/5 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
          >
            <a href={tgHref} target="_blank" rel="noopener noreferrer">
              <Send className="size-4" /> {isKk ? "Telegram-ға жіберу" : "Отправить в Telegram"}
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void copyText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? (isKk ? "Көшірілді" : "Скопировано") : (isKk ? "Мәтінді көшіру" : "Скопировать текст")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
