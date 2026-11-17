"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Image as ImageIcon, Loader2, Printer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { GroupCard, GroupMode, GroupWork } from "@/lib/handouts/group-work";
import { downloadSheetImages } from "@/lib/handouts/sheet-export";
import { menuSide } from "@/lib/ui/menu-side";
import { announceMaterialSaved, fetchPlanMaterial } from "@/lib/materials/plan-material-client";
import s from "./group-work.module.css";

/** Цвета кружков-номеров заданий, как на образце: оранжевый, зелёный, розовый, синий, фиолетовый. */
const NUMBER_COLORS = ["#f59e0b", "#22a35a", "#e5427a", "#2f6df0", "#8b4fe0"];
const SCHEMA_COLORS = ["#ffe0ec", "#dff5e6", "#e3e9ff", "#fff1d6"];
const PRINT_CSS = `@media print {
  @page { size: A4 landscape; margin: 0; }
  body > *:not([role="dialog"]) { display: none !important; }
  [role="dialog"] { position: static !important; transform: none !important; width: auto !important; max-width: none !important; max-height: none !important; overflow: visible !important; }
}`;

/**
 * Длина ситуации и заданий у карточек разная, а страница A4 фиксирована: шрифт
 * уменьшается шагами, пока содержимое не перестанет вылезать за панель.
 */
function useFitText(ref: RefObject<HTMLElement | null>, max: number, min: number, deps: unknown[]) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      let size = max;
      box.style.fontSize = `${size}px`;
      while (box.scrollHeight > box.clientHeight + 1 && size > min) {
        size -= 0.5;
        box.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Картинка и шрифт догружаются позже и меняют место для текста.
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересчёт при смене содержимого карточки
  }, deps);
}

function Card({ card, index, mode, language }: { card: GroupCard; index: number; mode: GroupMode; language: "ru" | "kz" }) {
  const label = mode === "pair" ? (language === "kz" ? "Жұп" : "Пара") : language === "kz" ? "Топ" : "Группа";
  const situationRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<HTMLOListElement | null>(null);
  useFitText(situationRef, 18, 12, [card.situation, card.imageBase64]);
  useFitText(tasksRef, 16.5, 12, [card.tasks]);
  return (
    <article className={s.page} data-theme={index % 4} data-sheet-page>
      <header className={s.head}>
        <div className={s.group}><span className={s.groupIcon} aria-hidden="true">👥</span>{label} {index + 1}</div>
        <h3 className={s.title}>{card.title}</h3>
        {card.note ? <div className={s.sticky}>{card.note}</div> : <span />}
      </header>
      <div className={s.body}>
        <div className={s.left}>
          <section className={s.panel}>
            <div className={s.chip}><span className={s.chipIcon} aria-hidden="true">📖</span>{language === "kz" ? "Жағдаят" : "Ситуация"}</div>
            <div className={s.situation}>
              <div ref={situationRef} className={s.situationText}>{card.situation.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {card.imageBase64 && <img className={s.image} src={`data:${card.imageMime ?? "image/jpeg"};base64,${card.imageBase64}`} alt="" />}
            </div>
          </section>
          {card.value && <div className={s.value}><span className={s.valueIcon} aria-hidden="true">💡</span>{card.value}</div>}
        </div>
        <div className={s.right}>
          <section className={s.panel}>
            <div className={s.chip}><span className={s.chipIcon} aria-hidden="true">⚙️</span>{language === "kz" ? "Топқа тапсырмалар" : mode === "pair" ? "Задания для пары" : "Задания для группы"}</div>
            <ol ref={tasksRef} className={s.tasks}>
              {card.tasks.map((task, i) => (
                <li key={i} className={s.task}>
                  <span className={s.num} style={{ background: NUMBER_COLORS[i % NUMBER_COLORS.length] }}>{i + 1}</span>
                  <span>{task.text}</span>
                  {task.schema && (
                    <div className={s.schema}>
                      {task.schema.map((step, j) => (
                        <span key={j} style={{ display: "contents" }}>
                          {j > 0 && <span className={s.arrow} aria-hidden="true">➜</span>}
                          <span style={{ background: SCHEMA_COLORS[j % SCHEMA_COLORS.length] }}>{step}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
          {card.slogan && <div className={s.slogan}>{card.slogan}</div>}
        </div>
      </div>
    </article>
  );
}

export function GroupCardsSheet({ work }: { work: GroupWork }) {
  return (
    <div className={s.stack}>
      <style>{PRINT_CSS}</style>
      {work.cards.map((card, i) => <Card key={i} card={card} index={i} mode={work.mode} language={work.language} />)}
    </div>
  );
}

interface GroupWorkButtonProps {
  planId: string;
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  learningObjectives?: string[];
  values?: string;
}

const cacheKey = (planId: string) => `handout:group:${planId}`;

function loadCached(planId: string): GroupWork | null {
  try {
    const raw = localStorage.getItem(cacheKey(planId));
    return raw ? (JSON.parse(raw) as GroupWork) : null;
  } catch {
    return null;
  }
}

/** Кнопка «Групповая работа»: выбор групп или пар, генерация, предпросмотр, печать и PNG. */
export function GroupWorkButton({ planId, topic, subject, grade, language, learningObjectives, values }: GroupWorkButtonProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left-0" | "right-0">("right-0");
  const [mode, setMode] = useState<GroupMode>("group");
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [work, setWork] = useState<GroupWork | null>(null);
  const [remote, setRemote] = useState<GroupWork | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/handouts/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, subject, grade, language, mode, count, learningObjectives, values: values || undefined, planId }),
      });
      const data = (await res.json().catch(() => null)) as { work?: GroupWork; error?: string } | null;
      if (!res.ok || !data?.work) throw new Error(data?.error || "Не удалось составить карточки");
      setWork(data.work);
      setOpen(false);
      announceMaterialSaved();
      try {
        localStorage.setItem(cacheKey(planId), JSON.stringify(data.work));
      } catch {
        // переполнение хранилища — карточки просто не запомнятся
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось составить карточки");
    } finally {
      setLoading(false);
    }
  }

  const local = open ? loadCached(planId) : null;
  const saved = local ?? remote;

  // Нет копии в браузере — карточки, сохранённые в уроке (групповые или парные).
  useEffect(() => {
    if (!open || remote || loadCached(planId)) return;
    let cancelled = false;
    void (async () => {
      const found = (await fetchPlanMaterial<GroupWork>(planId, "group_cards")) ?? (await fetchPlanMaterial<GroupWork>(planId, "pair_cards"));
      if (!cancelled && found?.cards) setRemote(found);
    })();
    return () => { cancelled = true; };
  }, [open, remote, planId]);

  return (
    <div className="relative">
      <Button variant="outline" onClick={(e) => { setSide(menuSide(e.currentTarget)); setOpen((v) => !v); }} disabled={!topic}>
        <Users /> Групповая работа
      </Button>
      {open && (
        <div className={`absolute ${side} z-50 mt-2 w-80 space-y-3 rounded-lg border border-border bg-surface p-4 shadow-lg`}>
          <p className="text-xs text-muted-foreground">Ситуация, пять заданий, схема и ценность урока — на каждую {mode === "pair" ? "пару" : "группу"} своя карточка.</p>
          {saved && (
            <button type="button" onClick={() => { setWork(saved); setOpen(false); }} className="w-full rounded-md border border-violet-200 bg-violet-50/60 p-2 text-left text-sm hover:bg-violet-50">
              Открыть прошлые карточки
            </button>
          )}
          <div className="flex gap-1.5" role="radiogroup" aria-label="Формат работы">
            {([["group", "Группы"], ["pair", "Пары"]] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${mode === value ? "bg-ink text-white" : "bg-muted hover:bg-primary-soft"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs" role="radiogroup" aria-label="Сколько карточек">
            <span className="mr-1 text-muted-foreground">Карточек:</span>
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={`h-8 w-8 rounded-full font-medium ${count === n ? "bg-ink text-white" : "bg-muted hover:bg-primary-soft"}`}>
                {n}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="button" onClick={generate} disabled={loading} className="w-full">
            {loading ? <><Loader2 className="animate-spin" /> Составляем…</> : "Создать карточки"}
          </Button>
        </div>
      )}
      {work && <GroupWorkDialog work={work} onClose={() => setWork(null)} />}
    </div>
  );
}

/** Окно с карточками групп или пар: печать и PNG. Его открывают кнопка и панель комплекта. */
export function GroupWorkDialog({ work, onClose }: { work: GroupWork; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  async function saveImages() {
    if (!sheetRef.current) return;
    setSaving(true);
    setError(null);
    try {
      await downloadSheetImages(sheetRef.current, `${work.mode === "pair" ? "Парная" : "Групповая"} работа — ${work.topic}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить картинки");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-[min(1200px,96vw)] overflow-auto p-0">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-ink px-4 py-3 text-white print:hidden">
          <DialogTitle className="mr-auto text-base font-bold text-white">{work.mode === "pair" ? "Парная работа" : "Групповая работа"} · {work.topic}</DialogTitle>
          {error && <span role="alert" className="text-sm text-red-100">{error}</span>}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-bold text-[#5a2cd0] hover:bg-violet-100">
            <Printer className="h-4 w-4" /> Печать / PDF
          </button>
          <button type="button" onClick={saveImages} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-bold text-[#5a2cd0] hover:bg-violet-100 disabled:opacity-50">
            <ImageIcon className="h-4 w-4" /> {saving ? "Сохраняем…" : "Картинки PNG"}
          </button>
        </div>
        <div ref={sheetRef} className="p-4 print:p-0">
          <GroupCardsSheet work={work} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
