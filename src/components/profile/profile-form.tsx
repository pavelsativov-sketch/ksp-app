"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateMyProfileAction,
  type ProfileRow,
} from "@/app/actions/profile";

interface Props {
  initial: ProfileRow | null;
  email: string | null;
}

export function ProfileForm({ initial, email }: Props) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [school, setSchool] = useState(initial?.school ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [defaultGrade, setDefaultGrade] = useState<string>(
    initial?.default_grade != null ? String(initial.default_grade) : "",
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const grade = defaultGrade.trim() ? Number(defaultGrade) : null;
      const res = await updateMyProfileAction({
        full_name: fullName.trim() || null,
        school: school.trim() || null,
        city: city.trim() || null,
        default_grade:
          grade != null && !Number.isNaN(grade) && grade >= 0 && grade <= 12
            ? grade
            : null,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="space-y-4">
      {email && (
        <div className="text-xs text-slate-500">
          Email: <span className="font-mono">{email}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">ФИО учителя</Label>
          <Input
            id="profile-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Иванова Айгерим Ержановна"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-school">Школа</Label>
          <Input
            id="profile-school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="КГУ «Школа-гимназия №…»"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-city">Город / населённый пункт</Label>
          <Input
            id="profile-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Алматы"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-grade">Любимый класс по умолчанию</Label>
          <Input
            id="profile-grade"
            type="number"
            min={1}
            max={12}
            value={defaultGrade}
            onChange={(e) => setDefaultGrade(e.target.value)}
            placeholder="например, 7"
          />
          <p className="text-xs text-slate-500">
            Если заполнить — новый КСП по умолчанию будет создаваться для этого
            класса.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Сохраняем…
            </>
          ) : (
            "Сохранить профиль"
          )}
        </Button>
        {saved && (
          <span className="text-emerald-600 text-sm flex items-center gap-1">
            <Check className="w-4 h-4" /> Сохранено
          </span>
        )}
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>
    </div>
  );
}
