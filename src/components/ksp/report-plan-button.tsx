"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportPlanAction } from "@/app/actions/plans";
import { REPORT_REASON_LABEL, REPORT_REASONS } from "@/lib/report-reasons";

const REASON_OPTIONS = REPORT_REASONS.map((value) => ({
  value,
  label: REPORT_REASON_LABEL[value],
}));

/** Кнопка «Пожаловаться» на чужой публичный план. */
export function ReportPlanButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setPending(true);
    setMessage(null);
    const result = await reportPlanAction({ planId, reason, details });
    setPending(false);
    if ("ok" in result) {
      setMessage({ ok: true, text: "Спасибо, жалоба отправлена на рассмотрение." });
      setOpen(false);
      setDetails("");
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  // hooks выше — ранний return после них
  if (message?.ok) return <p role="status" className="text-xs text-slate-600">{message.text}</p>;

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Flag /> Пожаловаться
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 space-y-3 rounded-lg border border-slate-200 bg-surface p-4 shadow-lg">
          <p className="text-sm font-medium">Что не так с планом?</p>
          <div className="space-y-1.5">
            {REASON_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Подробности (необязательно)"
            className="w-full rounded-md border border-slate-300 p-2 text-sm"
          />
          {message && !message.ok && (
            <p role="alert" className="text-xs text-red-600">{message.text}</p>
          )}
          <Button size="sm" onClick={submit} disabled={pending} className="w-full">
            {pending ? "Отправка…" : "Отправить жалобу"}
          </Button>
        </div>
      )}
    </div>
  );
}
