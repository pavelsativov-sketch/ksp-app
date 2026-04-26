"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicatePlanAction } from "@/app/actions/plans";

export function ClonePlanButton({ planId }: { planId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            try {
              await duplicatePlanAction(planId);
            } catch (e) {
              // redirect() throws NEXT_REDIRECT — swallow; any real error surfaces as string.
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.includes("NEXT_REDIRECT")) setErr(msg);
            }
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Copy />} Создать на
        основе
      </Button>
      {err && <span className="text-xs text-red-600 self-center">{err}</span>}
    </>
  );
}
