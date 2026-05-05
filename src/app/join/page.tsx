"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(trimmed)) return;
    router.push(`/join/${trimmed}`);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Подключиться к уроку</h1>
          <p className="text-slate-500 text-sm mt-1">
            Введите 6-значный код, который показал учитель.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="code">Код сессии</Label>
            <Input
              id="code"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus
              maxLength={6}
              placeholder="ABCDEF"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
              }
              className="text-center font-mono text-2xl tracking-[0.4em]"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={code.length !== 6}
          >
            Войти <ArrowRight />
          </Button>
        </form>
      </div>
    </div>
  );
}
