"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Globe,
  Link2Off,
  Loader2,
  RefreshCcw,
  Share2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  sharePlanAction,
  unsharePlanAction,
} from "@/app/actions/plans";

interface ShareDialogProps {
  planId: string;
  initialSlug: string | null;
  initialVisibility: "private" | "unlisted" | "public";
}

export function ShareDialog({
  planId,
  initialSlug,
  initialVisibility,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Defer setState out of the effect body to satisfy
    // react-hooks/set-state-in-effect — a microtask is enough, and the URL
    // doesn't render until the dialog is opened anyway.
    const t = window.setTimeout(() => {
      setOrigin(window.location.origin);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const isShared = slug != null && visibility === "unlisted";
  const shareUrl = slug ? `${origin}/p/${slug}` : "";
  const qrUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`
    : "";

  async function enableShare(rotate = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await sharePlanAction({ id: planId, rotate });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.slug) {
        setSlug(res.slug);
        setVisibility("unlisted");
      }
    } finally {
      setLoading(false);
    }
  }

  async function disableShare() {
    setLoading(true);
    setError(null);
    try {
      const res = await unsharePlanAction(planId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setVisibility("private");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать. Скопируйте ссылку вручную.");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        title="Поделиться планом по ссылке"
      >
        <Share2 />
        Поделиться
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поделиться планом</DialogTitle>
            <DialogDescription>
              Сгенерируйте ссылку — её можно отправить коллеге, родителю
              ученика или показать на доске. Ссылка работает для всех, у кого
              она есть, без необходимости регистрироваться. Чтобы отозвать
              доступ — нажмите «Закрыть доступ».
            </DialogDescription>
          </DialogHeader>

          {!isShared ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-700">
              <p className="mb-3">
                План пока не опубликован. Видимость:{" "}
                <strong>
                  {visibility === "private"
                    ? "только вы"
                    : visibility === "public"
                      ? "публичный"
                      : "по ссылке"}
                </strong>
                .
              </p>
              <Button
                type="button"
                onClick={() => void enableShare(false)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Globe />
                )}
                Создать ссылку
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  Ссылка
                </label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy()}
                    title="Скопировать"
                  >
                    <Copy />
                    {copied ? "Скопировано" : "Копировать"}
                  </Button>
                </div>
              </div>

              {qrUrl && (
                <div className="flex flex-col items-center gap-2 rounded border border-slate-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      external QR API; next/image's loader can't proxy it. */}
                  <img
                    src={qrUrl}
                    alt="QR-код для ссылки на план"
                    width={180}
                    height={180}
                    className="rounded"
                  />
                  <p className="text-xs text-slate-500">
                    Покажите QR-код на доске или в презентации
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void enableShare(true)}
                  disabled={loading}
                  title="Сгенерировать новую ссылку и отозвать старую"
                >
                  <RefreshCcw />
                  Обновить ссылку
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void disableShare()}
                  disabled={loading}
                >
                  <Link2Off />
                  Закрыть доступ
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Готово
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
