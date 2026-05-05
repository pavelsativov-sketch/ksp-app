"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, PlayCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startSessionAction } from "@/app/actions/sessions";

/* eslint-disable @next/next/no-img-element */

export function StartSessionButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = window.location.origin;
    const h = setTimeout(() => setOrigin(o), 0);
    return () => clearTimeout(h);
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await startSessionAction(planId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCode(res.code ?? null);
    setSessionId(res.id ?? null);
  }

  function close() {
    setOpen(false);
    setCode(null);
    setSessionId(null);
    setError(null);
  }

  const joinUrl = code && origin ? `${origin}/join/${code}` : "";

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          if (!code) void start();
        }}
      >
        <Users /> Запустить квиз
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold flex items-center gap-2">
              <PlayCircle className="text-blue-600" /> Класс-код
            </h2>

            {busy && (
              <div className="flex items-center gap-2 text-slate-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Создаём сессию…
              </div>
            )}

            {error && (
              <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm px-3 py-2">
                {error}
              </div>
            )}

            {code && (
              <>
                <p className="text-slate-600 text-sm">
                  Ученики заходят на{" "}
                  <span className="font-mono font-semibold">{origin}/join</span>{" "}
                  и вводят код:
                </p>

                <div className="text-4xl md:text-5xl font-extrabold tracking-[0.4em] text-center bg-slate-50 border border-slate-200 rounded-lg py-5 select-all font-mono">
                  {code}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={joinUrl}
                    onClick={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      void navigator.clipboard.writeText(joinUrl);
                    }}
                    aria-label="Скопировать ссылку"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>

                {joinUrl && (
                  <div className="flex justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`}
                      alt="QR-код для подключения"
                      width={180}
                      height={180}
                      className="rounded border border-slate-200"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (sessionId) router.push(`/sessions/${sessionId}`);
                    }}
                  >
                    Открыть live-таблицу
                  </Button>
                  <Button variant="outline" onClick={close}>
                    Закрыть
                  </Button>
                </div>
              </>
            )}

            {!busy && !code && error && (
              <Button variant="outline" onClick={close} className="w-full">
                Закрыть
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
