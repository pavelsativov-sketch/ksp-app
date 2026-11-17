"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Gamepad2, Grid3x3, HeartHandshake, Layers, Loader2, MonitorPlay, RotateCcw, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Handout } from "@/lib/handouts/types";
import type { GroupWork } from "@/lib/handouts/group-work";
import type { LessonKit, MaterialKind, MaterialSlot, StageKey } from "@/lib/types/ksp";
import { DERIVED_KINDS, slotRequest, slotStatus, type KitLessonContext, type SlotStatus } from "@/lib/materials/kit-requests";
import { MATERIAL_SAVED_EVENT, fetchPlanMaterial } from "@/lib/materials/plan-material-client";
import { HandoutPreview } from "./handout-preview";
import { GroupWorkDialog } from "./group-work";
import s from "./kit-panel.module.css";

const STAGES_RU: Array<[StageKey, string]> = [["beginning", "Начало урока"], ["middle", "Середина урока"], ["end", "Конец урока"]];
const STAGES_KZ: Array<[StageKey, string]> = [["beginning", "Сабақтың басы"], ["middle", "Сабақтың ортасы"], ["end", "Сабақтың соңы"]];
const ICONS: Record<MaterialKind, LucideIcon> = {
  worksheet: FileText, oop_sheet: HeartHandshake, group_cards: Users, pair_cards: Users,
  crossword: Grid3x3, flashcards: Layers, deck: MonitorPlay, interactive: Gamepad2,
};
/** Дольше самого долгого маршрута (лист с картинкой до 120 с): после этого считаем, что запрос пропал. */
const RUN_WINDOW_MS = 4 * 60_000;
const POLL_MS = 8_000;

type Runs = Partial<Record<MaterialKind, number>>;
type MaterialSummary = { kind: MaterialKind; stage: StageKey; title: string };
const EMPTY_KIT: LessonKit = { workForms: ["individual"], minutes: 45, slots: [] };
const runKey = (planId: string) => `kit-run:${planId}`;

/** Когда запущено создание материала: переживает уход со страницы и перезагрузку. */
function readRuns(planId: string): Runs {
  try {
    return (JSON.parse(localStorage.getItem(runKey(planId)) ?? "{}") as Runs) ?? {};
  } catch {
    return {};
  }
}

function writeRun(planId: string, kind: MaterialKind, startedAt: number | null) {
  try {
    const next: Runs = { ...readRuns(planId) };
    if (startedAt === null) delete next[kind];
    else next[kind] = startedAt;
    localStorage.setItem(runKey(planId), JSON.stringify(next));
  } catch {
    // Без памяти о запуске панель просто покажет «Создать» после перезагрузки.
  }
}

type Opened =
  | { type: "sheet"; handout: Handout; docxBase64?: string; title: string; variant: "student" | "oop" }
  | { type: "group"; work: GroupWork };

const STATUS_TEXT: Record<"ru" | "kz", Record<SlotStatus, string>> = {
  ru: { planned: "Не создан", generating: "Готовится", ready: "Готово", failed: "Не получилось" },
  kz: { planned: "Жасалмаған", generating: "Дайындалуда", ready: "Дайын", failed: "Сәтсіз" },
};

/** Слот, чьё состояние показывает этот: лист ООП повторяет рабочий лист. */
function sourceSlot(slot: MaterialSlot, slots: MaterialSlot[]): MaterialSlot {
  const source = DERIVED_KINDS[slot.kind];
  return source && source !== "plan" ? slots.find((x) => x.kind === source) ?? slot : slot;
}

/**
 * Комплект урока на странице плана: материалы по этапам и их готовность. После
 * создания урока (?kit=start) сам запускает все материалы параллельно; маршруты
 * сохраняют результат в урок, поэтому со страницы можно уйти.
 */
export function KitPanel({ kit: kitProp, ctx, footer }: { kit?: LessonKit; ctx: KitLessonContext; footer?: string }) {
  const { planId } = ctx;
  const isKz = ctx.language === "kz";
  const STAGES = isKz ? STAGES_KZ : STAGES_RU;
  const router = useRouter();
  const kit = kitProp ?? EMPTY_KIT;
  const [saved, setSaved] = useState<Set<MaterialKind>>(new Set());
  const [unattached, setUnattached] = useState<MaterialSummary[]>([]);
  const [assessment, setAssessment] = useState<"none" | "synced" | "stale">("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Runs>({});
  const [now, setNow] = useState(() => Date.now());
  const [opened, setOpened] = useState<Opened | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async (): Promise<Set<MaterialKind> | null> => {
    try {
      const res = await fetch(`/api/plans/${planId}/kit`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { materials?: MaterialSummary[]; unattached?: MaterialSummary[]; assessment?: "none" | "synced" | "stale" };
      const kinds = new Set((data.materials ?? []).map((m) => m.kind));
      setSaved(kinds);
      setUnattached(data.unattached ?? []);
      setAssessment(data.assessment ?? "none");
      return kinds;
    } catch {
      return null;
    } finally {
      setRuns(readRuns(planId));
      setNow(Date.now());
      setLoaded(true);
    }
  }, [planId]);

  /** Изменение КСП из панели: баллы листа в «Оценивание» или материал на этап. */
  const changePlan = useCallback(async (key: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch(`/api/plans/${planId}/kit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Не удалось обновить КСП");
      await refresh();
      // Страница урока перечитывает КСП: новые «Оценивание», «Ресурсы» и действия этапов видны сразу.
      router.refresh();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось обновить КСП");
      return false;
    } finally {
      setBusy(null);
    }
  }, [planId, refresh, router]);

  const start = useCallback(async (slot: MaterialSlot) => {
    const request = slotRequest(slot, kit, ctx);
    if (!request) return;
    setRunning((prev) => new Set(prev).add(slot.id));
    setFailed((prev) => {
      const next = { ...prev };
      delete next[slot.id];
      return next;
    });
    writeRun(planId, slot.kind, Date.now());
    try {
      const res = await fetch(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Сервер не ответил, повторите позже");
      setSaved((prev) => new Set(prev).add(slot.kind));
      // Баллы нового листа сразу становятся шкалой «Оценивания» в КСП.
      if (slot.kind === "worksheet") void changePlan("assessment", { action: "sync-assessment" });
    } catch (e) {
      setFailed((prev) => ({ ...prev, [slot.id]: e instanceof Error ? e.message : "Не удалось создать" }));
    } finally {
      writeRun(planId, slot.kind, null);
      setRuns(readRuns(planId));
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(slot.id);
        return next;
      });
    }
  }, [changePlan, ctx, kit, planId]);

  // Материал создан плиткой урока (не из комплекта): перечитываем, чтобы предложить подключить его.
  useEffect(() => {
    const onSaved = () => { void refresh(); };
    window.addEventListener(MATERIAL_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(MATERIAL_SAVED_EVENT, onSaved);
  }, [refresh]);

  const statusOf = (slot: MaterialSlot): SlotStatus => {
    const own = sourceSlot(slot, kit.slots);
    if (failed[own.id]) return "failed";
    if (running.has(own.id)) return "generating";
    return slotStatus(slot, saved, runs[own.kind], now, RUN_WINDOW_MS);
  };

  // Первый показ: что уже готово; сразу после создания урока — запуск всех материалов.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const autostart = url.searchParams.get("kit") === "start";
    if (autostart) {
      url.searchParams.delete("kit");
      window.history.replaceState(null, "", url.toString());
    }
    void refresh().then((kinds) => {
      if (!autostart || !kinds) return;
      const fresh = readRuns(planId);
      const todo = kit.slots.filter((slot) => {
        if (DERIVED_KINDS[slot.kind] || kinds.has(slot.kind)) return false;
        const startedAt = fresh[slot.kind];
        return !(startedAt && Date.now() - startedAt < RUN_WINDOW_MS);
      });
      // Презентация после остальных: её слайды «Групповая работа» и «Оценивание» берутся из готовых карточек и листа.
      const deck = todo.find((slot) => slot.kind === "deck");
      const rest = todo.filter((slot) => slot !== deck);
      void Promise.allSettled(rest.map((slot) => start(slot))).then(() => (deck ? start(deck) : undefined));
    });
  }, [kit.slots, planId, refresh, start]);

  const statuses = kit.slots.map((slot) => (loaded ? statusOf(slot) : "planned"));
  // Материал готовится в другом запросе (учитель вернулся на страницу): спрашиваем сервер.
  const waiting = kit.slots.some((slot, i) => statuses[i] === "generating" && !running.has(sourceSlot(slot, kit.slots).id));
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refresh]);

  async function open(slot: MaterialSlot) {
    const kind = sourceSlot(slot, kit.slots).kind;
    setOpening(slot.id);
    try {
      if (kind === "group_cards" || kind === "pair_cards") {
        const work = await fetchPlanMaterial<GroupWork>(planId, kind);
        if (work?.cards) setOpened({ type: "group", work });
      } else {
        const sheet = await fetchPlanMaterial<{ handout: Handout; docxBase64?: string }>(planId, kind);
        if (sheet?.handout) setOpened({ type: "sheet", handout: sheet.handout, docxBase64: sheet.docxBase64, title: slot.title, variant: slot.kind === "oop_sheet" ? "oop" : "student" });
      }
    } finally {
      setOpening(null);
    }
  }

  const ready = statuses.filter((status) => status === "ready").length;
  const missing = kit.slots.filter((slot, i) => (statuses[i] === "planned" || statuses[i] === "failed") && !DERIVED_KINDS[slot.kind]);
  // Старый урок без комплекта и без материалов: панели нечего показать.
  if (kit.slots.length === 0 && unattached.length === 0) return null;

  return (
    <section className={s.panel} aria-labelledby="kit-panel-title">
      <header className={s.head}>
        <div>
          <h3 id="kit-panel-title" className={s.title}>{isKz ? "Сабақ жинағы" : "Комплект урока"}</h3>
          <p className={s.lead}>
            {!loaded
              ? isKz ? "Материалдар тексерілуде…" : "Проверяем материалы…"
              : kit.slots.length
                ? isKz
                  ? `Дайыны: ${ready} / ${kit.slots.length}. Материалдар сабақта сақталады.`
                  : `Готово ${ready} из ${kit.slots.length}. Материалы сохраняются в уроке, со страницы можно уйти.`
                : isKz
                  ? "Жасалған материалдарды сабақ кезеңдеріне қосыңыз: олар ҚМЖ-да көрінеді."
                  : "Подключите созданные материалы к этапам урока: они появятся в КСП."}
          </p>
        </div>
        {loaded && missing.length > 1 && (
          <button type="button" className={s.all} onClick={() => missing.forEach((slot) => void start(slot))}>
            <Sparkles aria-hidden="true" /> {isKz ? "Барлығын жасау" : "Создать всё"}
          </button>
        )}
      </header>
      {kit.slots.length > 0 && <div className={s.meter} aria-hidden="true"><span style={{ width: `${(ready / kit.slots.length) * 100}%` }} /></div>}

      {(assessment === "stale" || unattached.length > 0 || notice) && (
        <ul className={s.notices}>
          {assessment === "stale" && (
            <li className={s.notice}>
              <span>Баллы рабочего листа не совпадают с колонкой «Оценивание» в КСП.</span>
              <button type="button" className={s.action} disabled={busy === "assessment"} onClick={() => void changePlan("assessment", { action: "sync-assessment" })}>
                {busy === "assessment" ? <Loader2 aria-hidden="true" className={s.spin} /> : "Перенести баллы"}
              </button>
            </li>
          )}
          {unattached.map((m) => (
            <li key={m.kind} className={s.notice}>
              <span>«{m.title}» создан, но не подключён к уроку. К какому этапу?</span>
              <span className={s.stageButtons}>
                {STAGES.map(([stage, label]) => (
                  <button key={stage} type="button" className={s.action} disabled={busy !== null} onClick={() => void changePlan(`attach:${m.kind}:${stage}`, { action: "attach", kind: m.kind, stage })}>
                    {busy === `attach:${m.kind}:${stage}` ? <Loader2 aria-hidden="true" className={s.spin} /> : label.replace(" урока", "")}
                  </button>
                ))}
              </span>
            </li>
          ))}
          {notice && <li role="alert" className={`${s.notice} ${s.noticeError}`}>{notice}</li>}
        </ul>
      )}

      <div className={s.stages}>
        {STAGES.map(([stage, label]) => {
          const slots = kit.slots.filter((slot) => slot.stage === stage);
          if (slots.length === 0) return null;
          return (
            <div key={stage} className={s.stage}>
              <h4>{label}</h4>
              <ul>
                {slots.map((slot) => {
                  const status = statuses[kit.slots.indexOf(slot)];
                  const Icon = ICONS[slot.kind];
                  const derived = Boolean(DERIVED_KINDS[slot.kind]);
                  const error = failed[sourceSlot(slot, kit.slots).id];
                  return (
                    <li key={slot.id} className={s.slot} data-status={status}>
                      <span className={s.icon} aria-hidden="true"><Icon /></span>
                      <span className={s.name}>
                        <b>{slot.title}</b>
                        <small className={s.status} aria-live="polite">
                          {status === "generating" && <Loader2 aria-hidden="true" className={s.spin} />}
                          {status === "ready" && <Check aria-hidden="true" />}
                          {status === "failed" ? error || STATUS_TEXT[isKz ? "kz" : "ru"].failed : STATUS_TEXT[isKz ? "kz" : "ru"][status]}
                        </small>
                      </span>
                      {status === "ready" && slot.kind === "deck" && <Link className={s.action} href={`/plans/${planId}/presentation`}>{isKz ? "Ашу" : "Открыть"}</Link>}
                      {status === "ready" && slot.kind !== "deck" && slot.kind !== "interactive" && (
                        <button type="button" className={s.action} onClick={() => void open(slot)} disabled={opening === slot.id}>
                          {opening === slot.id ? <Loader2 aria-hidden="true" className={s.spin} /> : isKz ? "Ашу" : "Открыть"}
                        </button>
                      )}
                      {(status === "planned" || status === "failed") && !derived && (
                        <button type="button" className={s.action} onClick={() => void start(slot)}>
                          {status === "failed" ? <><RotateCcw aria-hidden="true" /> {isKz ? "Қайталау" : "Повторить"}</> : isKz ? "Жасау" : "Создать"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {opened?.type === "sheet" && (
        <HandoutPreview
          handout={opened.handout}
          docxBase64={opened.docxBase64}
          title={opened.title}
          fileName={`${opened.title} — ${ctx.topic}.docx`}
          initialVariant={opened.variant}
          onClose={() => setOpened(null)}
          meta={{ topic: ctx.topic, subject: ctx.subject, grade: ctx.grade, language: ctx.language, footer }}
        />
      )}
      {opened?.type === "group" && <GroupWorkDialog work={opened.work} onClose={() => setOpened(null)} />}
    </section>
  );
}
