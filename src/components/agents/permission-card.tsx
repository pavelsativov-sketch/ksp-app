"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Check, X, ShieldCheck } from "lucide-react";

interface Pending {
  id: string;
  command: string;
  risk: string;
  createdAt: number;
}

/** Карточка «⚠ AI хочет выполнить…» с Allow / Deny / Always allow. */
export function PermissionCard({ active }: { active: boolean }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [alwaysAllowed, setAlwaysAllowed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/agents/permissions", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { pending?: Pending[]; alwaysAllowed?: boolean };
        if (alive) {
          setPending(data.pending ?? []);
          setAlwaysAllowed(data.alwaysAllowed === true);
        }
      } catch { /* повторится */ }
    };
    void poll();
    const iv = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, [active]);

  async function decide(id: string, allow: boolean, always = false) {
    setPending((p) => p.filter((r) => r.id !== id));
    try { await fetch("/api/agents/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, allow, always }) }); } catch { /* запрос истечёт сам */ }
  }

  async function revokeAlways() {
    try {
      const res = await fetch("/api/agents/permissions", { method: "DELETE" });
      if (res.ok) setAlwaysAllowed(false);
    } catch { /* preference remains visible until the server confirms revocation */ }
  }

  if (!active || (pending.length === 0 && !alwaysAllowed)) return null;

  return (
    <div className="mx-3 mb-2 shrink-0 space-y-2">
      {alwaysAllowed && <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-200">
        <span><ShieldCheck className="mr-1 inline size-3.5" />High-risk commands are always allowed for this account.</span>
        <button type="button" onClick={() => void revokeAlways()} className="shrink-0 underline underline-offset-2 hover:text-white">Revoke</button>
      </div>}
      {pending.map((r) => (
        <div key={r.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <ShieldAlert className="size-3.5" /> AI хочет выполнить опасное действие
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-200">{r.command}</pre>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => void decide(r.id, true, false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20">
              <Check className="size-3" /> Allow
            </button>
            <button type="button" onClick={() => void decide(r.id, false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20">
              <X className="size-3" /> Deny
            </button>
            <button type="button" onClick={() => void decide(r.id, true, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10">
              <ShieldCheck className="size-3" /> Always
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
