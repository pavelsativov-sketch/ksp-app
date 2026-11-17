"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import s from "./auth.module.css";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  id: string;
  name: string;
  label: string;
  error?: string;
  hint?: string;
};

/** Поле формы входа: подпись, ошибка привязана к полю (aria-describedby), а не висит отдельно. */
export function AuthField({ id, name, label, error, hint, ...input }: FieldProps) {
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && !error && <p id={`${id}-hint`} className={s.hint}>{hint}</p>}
      {error && <p id={`${id}-error`} className={s.fieldError}>{error}</p>}
    </div>
  );
}

/**
 * Пароль с кнопкой «показать». minLength включает подсказку, сколько символов
 * осталось: учитель видит правило до отправки, а не после ошибки сервера.
 */
export function PasswordField({ id, name, label, error, autoComplete, minLength }: { id: string; name: string; label: string; error?: string; autoComplete: string; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  const [length, setLength] = useState(0);
  const left = minLength ? Math.max(0, minLength - length) : 0;
  const hint = minLength ? (left > 0 ? `Минимум ${minLength} символов, осталось ${left}` : "Длина подходит") : undefined;
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <div className={s.passwordBox}>
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setLength(e.target.value.length)}
        />
        <button type="button" className={s.eye} onClick={() => setVisible((v) => !v)} aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {hint && !error && <p id={`${id}-hint`} className={s.hint} data-ok={left === 0 && length > 0 ? "" : undefined}>{hint}</p>}
      {error && <p id={`${id}-error`} className={s.fieldError}>{error}</p>}
    </div>
  );
}

export function AuthSubmit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button type="submit" className={s.submit} disabled={pending} aria-busy={pending}>
      {pending ? <><Loader2 aria-hidden="true" className={s.spin} /> {busy}</> : idle}
    </button>
  );
}

export function AuthMessage({ error, info }: { error?: string; info?: string }) {
  if (error) return <p role="alert" className={s.formError}>{error}</p>;
  if (info) return <p role="status" className={s.formInfo}>{info}</p>;
  return null;
}
