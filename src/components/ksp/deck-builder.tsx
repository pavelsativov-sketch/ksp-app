"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DECK_PALETTES,
  DECK_THEMES,
  SLIDE_FIELDS,
  SLIDE_KINDS,
  descriptorPoints,
  parseBranch,
  slideKindLabel,
  splitThesis,
  type DeckSlide,
  type DeckTheme,
  type SlideKind,
} from "@/lib/materials/deck-types";
import { PRESENTON_TEMPLATES, PRESENTON_TEMPLATE_LABELS, type PresentonTemplateId } from "@/lib/materials/presenton";
import { fetchPlanMaterial, savePlanMaterialClient } from "@/lib/materials/plan-material-client";
import { MathText } from "@/lib/math/render-math";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import s from "./deck-builder.module.css";

const THEME_LABELS: Record<DeckTheme, { ru: string; kk: string }> = {
  network: { ru: "Сеть", kk: "Желі" },
  lavender: { ru: "Лаванда", kk: "Лаванда" },
  ocean: { ru: "Океан", kk: "Мұхит" },
  sunset: { ru: "Закат", kk: "Күн батуы" },
};
const hex = (color: string) => `#${color}`;
const MAX_LOCAL_DRAFT_BYTES = 1_500_000;
const MAX_DECK_AI_IMAGES = 6;

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function loadDraft(key: string): { slides: DeckSlide[]; theme: DeckTheme } | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: { slides: DeckSlide[]; theme: DeckTheme }) {
  try {
    const raw = JSON.stringify(draft);
    if (raw.length <= MAX_LOCAL_DRAFT_BYTES) {
      localStorage.setItem(key, raw);
      return;
    }
    // Если слайды с картинками превышают лимит localStorage, кэшируем в браузере структуру,
    // а полные картинки надёжно сохраняются на сервере в plan_materials.
    const light = {
      theme: draft.theme,
      slides: draft.slides.map((sl) => ({ ...sl, imageDataUri: "" })),
    };
    localStorage.setItem(key, JSON.stringify(light));
  } catch {
    // Черновик в браузере необязателен: презентацию можно собрать и без него.
  }
}

function SlidePicture({ slide, isKk, className }: { slide: DeckSlide; isKk: boolean; className?: string }) {
  if (slide.imageDataUri) {
    return (
      <div className={`${s.picture} ${s.pictureHasImg} ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.imageDataUri} alt={slide.title} className={s.pictureImg} />
      </div>
    );
  }
  if (!slide.imagePrompt) return null;
  return (
    <div className={`${s.picture} ${className ?? ""}`}>
      {isKk ? "ЖИ суреті" : "Картинка ИИ"}: {slide.imagePrompt}
    </div>
  );
}

/** Похожий на итоговый слайд показ: размеры в долях ширины, поэтому годится и для миниатюры. */
function SlideView({
  slide,
  theme,
  play = false,
  isKk = false,
  interactiveQuiz = false,
  quizRevealed = true,
  onRevealQuiz,
}: {
  slide: DeckSlide;
  theme: DeckTheme;
  play?: boolean;
  isKk?: boolean;
  interactiveQuiz?: boolean;
  quizRevealed?: boolean;
  onRevealQuiz?: () => void;
}) {
  const p = DECK_PALETTES[theme];
  const tone = (i: number) => hex(p.tones[i % p.tones.length]!);
  const light = { background: hex(p.soft), color: hex(p.ink) };
  const title = <div className={s.sTitle}><MathText text={slide.title} /></div>;
  const centerTitle = <div className={`${s.sTitle} ${s.center}`}><MathText text={slide.title} /></div>;
  const band = slide.takeaway ? <div className={s.band} style={{ background: hex(p.band) }}><MathText text={slide.takeaway} /></div> : null;
  const hasPic = Boolean(slide.imageDataUri || slide.imagePrompt);
  const picture = hasPic ? <SlidePicture slide={slide} isKk={isKk} /> : null;
  let body;
  switch (slide.kind) {
    case "title":
      body = hasPic ? (
        <div className={s.titleSplit}>
          <div className={s.grow} style={{ justifyContent: "center" }}>
            <div className={s.sTitle} style={{ fontSize: "4.8cqw" }}><MathText text={slide.title} /></div>
            <div className={s.sLead} style={{ color: hex(p.accent), fontWeight: 700, fontSize: "2.8cqw" }}><MathText text={slide.lead} /></div>
          </div>
          <div className={s.titleImageWrap}>
            <SlidePicture slide={slide} isKk={isKk} />
          </div>
        </div>
      ) : (
        <div className={s.grow} style={{ justifyContent: "center" }}>
          <div className={s.sTitle} style={{ fontSize: "5.4cqw", maxWidth: "62%" }}><MathText text={slide.title} /></div>
          <div className={s.sLead} style={{ color: hex(p.accent), fontWeight: 700, fontSize: "3cqw" }}><MathText text={slide.lead} /></div>
        </div>
      );
      break;
    case "mood":
      body = hasPic ? (
        <>{centerTitle}<div className={s.split}><div className={s.grid2}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i) }}><MathText text={point} /></div>)}</div>{picture}</div></>
      ) : (
        <>{centerTitle}<div className={s.grid2}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i) }}><MathText text={point} /></div>)}</div></>
      );
      break;
    case "guess":
      body = <>{centerTitle}{picture}<div className={s.row}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div>)}</div></>;
      break;
    case "goals":
      body = <>{title}<div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.row}><div className={s.box} style={{ flex: "0 0 7cqw", background: tone(i) }}>{i + 1}</div><div className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div></div>)}</div></>;
      break;
    case "flow":
      body = <>{title}<div className={s.sLead} style={{ color: hex(p.muted) }}><MathText text={slide.lead} /></div>
        <div className={s.row}>{slide.steps.flatMap((step, i) => [<div key={i} className={`${s.box} ${s.tall}`} style={{ background: tone(i) }}><MathText text={step} /></div>, i < slide.steps.length - 1 ? <span key={`a${i}`} className={s.arrow} style={{ color: hex(p.accent) }}>➜</span> : null])}</div>
        <div className={s.row} style={{ flex: 1, alignItems: "stretch" }}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={{ background: "#fff", color: hex(p.ink), border: `1px solid ${tone(i)}` }}><MathText text={point} /></div>)}</div></>;
      break;
    case "list":
      body = <>{title}<div className={s.split} style={{ paddingBottom: slide.takeaway ? "7cqw" : 0 }}><div className={s.grow} style={{ justifyContent: "space-around" }}>{slide.points.map((point, i) => <div key={i} className={s.bullet}>•  <MathText text={point} /></div>)}</div>{picture}</div>{band}</>;
      break;
    case "cards":
      body = <>{title}<div className={slide.points.length <= 4 ? s.grid2 : s.grid3} style={{ marginBottom: slide.takeaway ? "7cqw" : 0 }}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i), fontSize: "2.5cqw" }}><MathText text={point} /></div>)}</div>{band}</>;
      break;
    case "question":
      body = <><div className={s.bubble} style={{ background: hex(p.accent) }}><MathText text={slide.title} /></div><div className={s.row} style={{ flex: 1, alignItems: "stretch" }}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div>)}</div></>;
      break;
    case "quiz":
      body = (
        <>
          {title}
          <div className={s.grid2}>
            {slide.options.map((option, i) => {
              const isCorrect = i === slide.correctIndex;
              const showCorrect = quizRevealed && isCorrect;
              const borderStyle = showCorrect ? `0.5cqw solid #2fa45f` : `0.4cqw solid ${tone(i)}`;
              const bgStyle = showCorrect ? "#dcfce7" : light.background;
              if (interactiveQuiz) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={onRevealQuiz}
                    className={`${s.box} ${s.boxLight} ${s.quizBtn}`}
                    style={{ background: bgStyle, color: light.color, border: borderStyle, fontSize: "2.6cqw" }}
                  >
                    <span>
                      {showCorrect ? "✓ " : ""}
                      {"АБВГ"[i]}. <MathText text={option} />
                    </span>
                  </button>
                );
              }
              return (
                <div
                  key={i}
                  className={`${s.box} ${s.boxLight}`}
                  style={{ background: bgStyle, color: light.color, border: borderStyle, fontSize: "2.6cqw" }}
                >
                  {"АБВГ"[i]}. <MathText text={option} />
                </div>
              );
            })}
          </div>
          {interactiveQuiz && !quizRevealed && (
            <div className={s.center} style={{ fontSize: "1.8cqw", color: hex(p.muted), fontWeight: 600 }}>
              {isKk ? "Дұрыс жауапты көрсету үшін нұсқаны басыңыз немесе Бос орын (Space) пернесін басыңыз" : "Нажмите на вариант или Пробел, чтобы показать правильный ответ"}
            </div>
          )}
        </>
      );
      break;
    case "activity":
      body = <>{centerTitle}<div className={`${s.sLead} ${s.center}`} style={{ color: hex(p.accent), fontWeight: 700 }}><MathText text={slide.lead} /></div><div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i), textAlign: "left", placeItems: "center start" }}>{i + 1}. <MathText text={point} /></div>)}</div></>;
      break;
    case "reflection":
      body = <>{centerTitle}<div className={s.grid3}>{slide.points.slice(0, 3).map((point, i) => <div key={i} className={s.center} style={{ fontSize: "2.6cqw", fontWeight: 700 }}><div className={s.light} style={{ background: ["#35b34a", "#2f7bf0", "#e5352d"][i] }} /><MathText text={point} /></div>)}</div></>;
      break;
    case "homework":
      body = <>{centerTitle}<div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div>)}</div></>;
      break;
    case "review":
      body = hasPic ? (
        <>{centerTitle}<div className={s.split}><div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.row}><div className={s.box} style={{ flex: "0 0 7cqw", background: tone(i) }}>?</div><div className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div></div>)}</div>{picture}</div></>
      ) : (
        <>{centerTitle}<div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.row}><div className={s.box} style={{ flex: "0 0 7cqw", background: tone(i) }}>?</div><div className={`${s.box} ${s.boxLight}`} style={light}><MathText text={point} /></div></div>)}</div></>
      );
      break;
    case "infographic": {
      const [main, accent] = splitThesis(slide.title);
      body = <>
        <div className={`${s.sTitle} ${s.center}`} style={{ background: "#fff", border: `0.2cqw solid ${hex(p.net)}`, borderRadius: "3cqw", padding: "0.8cqw 2cqw" }}>{main}<span style={{ color: hex(p.accent) }}>{accent}</span></div>
        {slide.lead && <div className={s.center} style={{ alignSelf: "center", padding: "0.6cqw 3cqw", fontSize: "2.6cqw", fontWeight: 800, color: hex(p.accent), border: `0.25cqw solid ${hex(p.accent)}`, borderRadius: "1.5cqw", background: "#fff" }}>{slide.lead}</div>}
        <div className={s.row} style={{ flex: 1, alignItems: "stretch" }}>{slide.points.slice(0, 5).map(parseBranch).map((branch, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5cqw", minWidth: 0 }}>
            <div className={s.box} style={{ flex: "none", minHeight: "7.4cqw", background: tone(i), fontSize: "1.7cqw" }}>{branch.head}</div>
            <div className={`${s.box} ${s.boxLight}`} style={{ flex: 1, background: "#fff", color: hex(p.ink), border: `0.2cqw solid ${tone(i)}`, flexDirection: "column", fontSize: "1.6cqw" }}><span style={{ fontSize: "4.5cqw" }}>{branch.icon}</span>{branch.caption}</div>
          </div>
        ))}</div>
        {slide.takeaway && <div className={s.center} style={{ padding: "1cqw 2cqw", fontSize: "2cqw", fontWeight: 700, borderRadius: "3cqw", background: hex(p.soft), border: `0.2cqw solid ${hex(p.accent)}` }}>💡 {slide.takeaway}</div>}
      </>;
      break;
    }
    case "groups":
      body = <>{centerTitle}<div className={`${s.sLead} ${s.center}`} style={{ color: hex(p.accent), fontWeight: 700 }}>{slide.lead}</div><div className={s.grid2}>{slide.points.slice(0, 4).map((point, i) => {
        const at = point.indexOf(":");
        return <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4cqw" }}><div className={s.box} style={{ flex: "none", background: tone(i), justifyContent: "flex-start" }}>👥 {at > 0 ? point.slice(0, at) : `${isKk ? "Топ" : "Группа"} ${i + 1}`}</div><div className={`${s.box} ${s.boxLight}`} style={{ background: "#fff", color: hex(p.ink), border: `0.2cqw solid ${tone(i)}` }}>{at > 0 ? point.slice(at + 1).trim() : point}</div></div>;
      })}</div></>;
      break;
    case "assessment": {
      const rows = slide.points.map(descriptorPoints);
      const total = rows.reduce((sum, row) => sum + (row.points ?? 0), 0);
      body = <>{centerTitle}<div className={s.grow}>{rows.map((row, i) => <div key={i} className={s.row}><div className={`${s.box} ${s.boxLight}`} style={{ ...light, justifyContent: "flex-start" }}>{row.text}</div>{row.points !== null && <div className={s.box} style={{ flex: "0 0 10cqw", background: tone(i) }}>{row.points} {isKk ? "б." : "б."}</div>}</div>)}</div>{total > 0 && <div className={s.box} style={{ flex: "none", alignSelf: "flex-end", padding: "0.8cqw 2.5cqw", background: hex(p.accent) }}>{isKk ? "Барлығы" : "Итого"}: {total} б.</div>}</>;
      break;
    }
    case "thanks":
      body = <div className={s.grow} style={{ justifyContent: "center", color: "#fff" }}><div className={`${s.sTitle} ${s.center}`} style={{ fontSize: "7cqw" }}>{slide.title}</div><div className={`${s.sLead} ${s.center}`}>{slide.lead}</div></div>;
      break;
  }
  const background = slide.kind === "title" ? hex(p.soft) : slide.kind === "thanks" ? hex(p.accent) : "#fff";
  return <div className={s.slide} style={{ background, color: hex(p.ink) }}><div className={`${s.inner} ${play ? s.play : ""}`}>{body}</div></div>;
}

function SlideForm({
  slide,
  isKk,
  generatingImage,
  imageProvider,
  onGenerateImage,
  onChange,
}: {
  slide: DeckSlide;
  isKk: boolean;
  generatingImage: boolean;
  imageProvider?: string;
  onGenerateImage: () => void;
  onChange: (patch: Partial<DeckSlide>) => void;
}) {
  const locale = isKk ? "kk" : "ru";
  const fields = SLIDE_FIELDS[slide.kind];
  const has = (name: (typeof fields)[number]) => fields.includes(name);
  return (
    <div className={s.form}>
      <label className={s.field}>{isKk ? "Макет" : "Макет"}
        <select className={s.select} value={slide.kind} onChange={(e) => onChange({ kind: e.target.value as SlideKind })}>
          {SLIDE_KINDS.map((kind) => <option key={kind} value={kind}>{slideKindLabel(kind, locale)}</option>)}
        </select>
      </label>
      <label className={s.field}>
        {slide.kind === "quiz" || slide.kind === "question"
          ? (isKk ? "Сұрақ" : "Вопрос")
          : (isKk ? "Тақырыпша" : "Заголовок")}
        <textarea rows={2} maxLength={200} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      {has("lead") && <label className={s.field}>{isKk ? "Қосымша тақырып" : "Подзаголовок"}<input maxLength={400} value={slide.lead} onChange={(e) => onChange({ lead: e.target.value })} /></label>}
      {has("steps") && <label className={s.field}>{isKk ? "Схема блоктары (әр жолға біреуден)" : "Блоки схемы, по одному в строке"}<textarea rows={3} value={slide.steps.join("\n")} onChange={(e) => onChange({ steps: e.target.value.split("\n").slice(0, 4) })} /></label>}
      {has("points") && <label className={s.field}>{slide.kind === "reflection" ? (isKk ? "Бағдаршам жазулары" : "Подписи светофора") : (isKk ? "Тармақтар (әр жолға біреуден)" : "Пункты, по одному в строке")}<textarea rows={5} value={slide.points.join("\n")} onChange={(e) => onChange({ points: e.target.value.split("\n").slice(0, 8) })} /></label>}
      {has("takeaway") && <label className={s.field}>{isKk ? "Төменгі қорытынды жолақ" : "Итог на плашке внизу"}<input maxLength={160} value={slide.takeaway} onChange={(e) => onChange({ takeaway: e.target.value })} placeholder="X = Y" /></label>}
      {has("options") && (
        <fieldset className={s.field}>
          <legend>{isKk ? "Нұсқалар (дұрыс жауапты белгілеңіз)" : "Варианты, отметьте верный. Он подсветится по клику"}</legend>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.optionRow}>
              <input type="radio" style={{ width: "auto" }} name={`correct-${slide.id}`} checked={slide.correctIndex === i} onChange={() => onChange({ correctIndex: i })} aria-label={`${isKk ? "Нұсқа" : "Вариант"} ${i + 1}`} />
              <input aria-label={`${isKk ? "Нұсқа" : "Вариант"} ${i + 1}`} maxLength={400} value={slide.options[i] ?? ""} onChange={(e) => { const next = [...slide.options]; next[i] = e.target.value; onChange({ options: next }); }} />
            </div>
          ))}
        </fieldset>
      )}
      {has("imagePrompt") && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-2.5">
          <label className={s.field}>
            {isKk ? "Иллюстрация сипаттамасы (ЖИ)" : "Картинка ИИ: что нарисовать"}
            <textarea
              rows={2}
              maxLength={600}
              value={slide.imagePrompt}
              onChange={(e) => onChange({ imagePrompt: e.target.value })}
              placeholder={isKk ? "Мысалы: мектеп зертханасындағы тәжірибе, жарқын иллюстрация" : "Например: solar system planets illustration, clean educational style"}
            />
            <span className={s.hint}>
              {isKk ? "Бос болса — слайд суретсіз қалады. Дайын сурет PowerPoint файлына тікелей салынады." : "Сгенерированная картинка сразу видна на слайде и встраивается в PowerPoint без повторной генерации."}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onGenerateImage}
              disabled={generatingImage}
            >
              {generatingImage ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> {isKk ? "Сурет салынуда…" : "Рисуем…"}
                </>
              ) : slide.imageDataUri ? (
                <>
                  <RefreshCw className="size-3.5" /> {isKk ? "Қайта салу" : "Перегенерировать"}
                </>
              ) : (
                <>
                  <ImageIcon className="size-3.5" /> {isKk ? "ЖИ суретін жасау" : "Сгенерировать картинку"}
                </>
              )}
            </Button>
            {slide.imageDataUri && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange({ imageDataUri: "" })}
                disabled={generatingImage}
              >
                <Trash2 className="size-3.5" /> {isKk ? "Өшіру" : "Убрать"}
              </Button>
            )}
            {imageProvider && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {imageProvider}
              </span>
            )}
          </div>
        </div>
      )}
      <label className={s.field}>
        {isKk ? "Мұғалімге арналған жазбалар" : "Заметки учителя"}
        <textarea rows={3} maxLength={2000} value={slide.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        <span className={s.hint}>{isKk ? "Көрсету режимінде («Жазбалар») және PowerPoint-та көрінеді." : "Видны в режиме показа (клавиша N) и докладчику в PowerPoint."}</span>
      </label>
    </div>
  );
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function SlidePresenter({
  slides,
  theme,
  initialIndex,
  isKk,
  onClose,
}: {
  slides: DeckSlide[];
  theme: DeckTheme;
  initialIndex: number;
  isKk: boolean;
  onClose: (lastIndex: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), Math.max(0, slides.length - 1)));
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  const slide = slides[index];

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(0, next), slides.length - 1);
      setIndex(clamped);
      setQuizRevealed(false);
      setBlackout(false);
    },
    [slides.length],
  );

  const handleAdvance = useCallback(() => {
    if (blackout) {
      setBlackout(false);
      return;
    }
    if (slide?.kind === "quiz" && !quizRevealed) {
      setQuizRevealed(true);
      return;
    }
    if (index < slides.length - 1) goTo(index + 1);
  }, [blackout, slide?.kind, quizRevealed, index, slides.length, goTo]);

  const toggleNativeFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void overlayRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setElapsedSec((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    const onFsChange = () => setIsNativeFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        onClose(index);
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        handleAdvance();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (index > 0) goTo(index - 1);
      } else if (e.key.toLowerCase() === "n") {
        setShowNotes((v) => !v);
      } else if (e.key.toLowerCase() === "b") {
        setBlackout((v) => !v);
      } else if (e.key.toLowerCase() === "f") {
        toggleNativeFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAdvance, goTo, index, onClose, toggleNativeFullscreen]);

  if (!slide) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={isKk ? "Презентацияны көрсету режимі" : "Полноэкранный показ презентации"}
      data-os-fullscreen="true"
      className={s.presenterOverlay}
    >
      <div className={s.presenterStage} onClick={handleAdvance}>
        {blackout ? (
          <div className="text-center text-sm text-white/50">
            {isKk ? "Экран уақытша өшірілді (жалғастыру үшін B немесе экранды басыңыз)" : "Экран затемнён для внимания класса (нажмите B или кликните для возврата)"}
          </div>
        ) : (
          <div
            className={s.presenterFrame}
            onClick={(e) => {
              if (slide.kind === "quiz") e.stopPropagation();
            }}
          >
            <div key={`${slide.id}:${theme}`}>
              <SlideView
                slide={slide}
                theme={theme}
                play
                isKk={isKk}
                interactiveQuiz
                quizRevealed={quizRevealed}
                onRevealQuiz={() => setQuizRevealed(true)}
              />
            </div>
          </div>
        )}
      </div>

      {showNotes && (
        <div className={s.presenterNotes}>
          <strong className="mr-2 text-violet-300">{isKk ? "Мұғалім жазбасы:" : "Заметки учителя:"}</strong>
          {slide.notes.trim() || (isKk ? "Бұл слайдқа жазба жоқ." : "Для этого слайда заметок нет.")}
        </div>
      )}

      <div className={s.presenterHud}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={s.presenterBtn}
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            aria-label={isKk ? "Алдыңғы слайд" : "Предыдущий слайд"}
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="tabular-nums font-bold">
            {index + 1} / {slides.length}
          </span>
          <button
            type="button"
            className={s.presenterBtn}
            disabled={index >= slides.length - 1 && (slide.kind !== "quiz" || quizRevealed)}
            onClick={handleAdvance}
            aria-label={isKk ? "Келесі слайд" : "Следующий слайд"}
          >
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="hidden max-w-md flex-1 items-center justify-center gap-1.5 overflow-x-auto md:flex">
          {slides.map((sl, i) => (
            <button
              key={sl.id}
              type="button"
              onClick={() => goTo(i)}
              title={`${i + 1}. ${sl.title}`}
              aria-label={`${isKk ? "Слайд" : "Слайд"} ${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-7 bg-violet-400" : "w-2.5 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={s.presenterBtn}
            onClick={() => setTimerRunning((v) => !v)}
            title={isKk ? "Таймерді кідірту / жалғастыру" : "Пауза / продолжить таймер"}
          >
            <Clock className="size-3.5" />
            <span className="tabular-nums">{formatTimer(elapsedSec)}</span>
          </button>
          <button
            type="button"
            className={`${s.presenterBtn} ${showNotes ? s.presenterBtnActive : ""}`}
            onClick={() => setShowNotes((v) => !v)}
            title="N"
          >
            <StickyNote className="size-3.5" /> {isKk ? "Жазбалар" : "Заметки"}
          </button>
          <button
            type="button"
            className={`${s.presenterBtn} ${blackout ? s.presenterBtnActive : ""}`}
            onClick={() => setBlackout((v) => !v)}
            title="B"
          >
            {blackout ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {isKk ? "Қара экран" : "Затемнить"}
          </button>
          <button
            type="button"
            className={s.presenterBtn}
            onClick={toggleNativeFullscreen}
            title="F"
            aria-label={isNativeFullscreen ? (isKk ? "Толық экраннан шығу" : "Выйти из полного экрана") : (isKk ? "Толық экран" : "На весь экран")}
          >
            {isNativeFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button
            type="button"
            className={s.presenterBtn}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
              onClose(index);
            }}
            aria-label={isKk ? "Көрсетуді аяқтау" : "Закрыть показ"}
          >
            <X className="size-4" /> {isKk ? "Шығу" : "Выход"}
          </button>
        </div>
      </div>
    </div>
  );
}

function makeSlideId(): string {
  return `n${Math.random().toString(36).slice(2, 9)}`;
}

function clean(slide: DeckSlide): DeckSlide {
  return {
    ...slide,
    steps: lines(slide.steps.join("\n")),
    points: lines(slide.points.join("\n")),
    options: slide.options.map((option) => option.trim()).filter(Boolean),
    imageDataUri: slide.imageDataUri ?? "",
  };
}

/** Конструктор: ИИ разбирает КСП и предлагает слайды, учитель правит, затем собирается PowerPoint. */
export function DeckBuilder({ planId, topic }: { planId: string; topic: string }) {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";
  const key = `deck:${planId}`;
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [theme, setTheme] = useState<DeckTheme>("network");
  const [selected, setSelected] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [presentonBusy, setPresentonBusy] = useState(false);
  const [presentonTemplate, setPresentonTemplate] = useState<PresentonTemplateId>("modern");
  const [presentonSlides, setPresentonSlides] = useState(8);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newKind, setNewKind] = useState<SlideKind>("list");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [generatingSlideId, setGeneratingSlideId] = useState<string | null>(null);
  const [batchImgProgress, setBatchImgProgress] = useState<string | null>(null);
  const [imageProviders, setImageProviders] = useState<Record<string, string>>({});
  const [presenting, setPresenting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slidesRef = useRef<DeckSlide[]>(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  // Черновик живёт в браузере и на сервере: подгружаем асинхронно после монтирования
  // и дотягиваем серверные картинки, если localStorage хранил облегчённую копию.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      const draft = loadDraft(key);
      if (draft?.slides?.length && !cancelled) {
        setSlides(draft.slides);
        setTheme(draft.theme);
      }
      const saved = await fetchPlanMaterial<{ slides?: DeckSlide[]; theme?: DeckTheme }>(planId, "deck");
      if (cancelled || !saved?.slides?.length) return;
      if (!draft?.slides?.length) {
        setSlides(saved.slides);
        if (saved.theme) setTheme(saved.theme);
        return;
      }
      const savedImgById = new Map(
        saved.slides
          .filter((sl) => Boolean(sl.imageDataUri))
          .map((sl) => [sl.id, sl.imageDataUri!]),
      );
      if (savedImgById.size > 0) {
        setSlides((prev) =>
          prev.map((sl) => (!sl.imageDataUri && savedImgById.has(sl.id) ? { ...sl, imageDataUri: savedImgById.get(sl.id)! } : sl)),
        );
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [key, planId]);

  function scheduleServerSave(nextSlides: DeckSlide[], nextTheme: DeckTheme) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void savePlanMaterialClient(planId, "deck", {
        title: `Презентация: ${topic}`,
        stage: "middle",
        payload: { slides: nextSlides.map(clean), theme: nextTheme },
      }).then((ok) => {
        setSaveState(ok ? "saved" : "idle");
      });
    }, 800);
  }

  function update(next: DeckSlide[], nextTheme = theme) {
    setSlides(next);
    saveDraft(key, { slides: next, theme: nextTheme });
    scheduleServerSave(next, nextTheme);
  }

  async function requestImageForSlide(target: DeckSlide): Promise<boolean> {
    const promptText = target.imagePrompt.trim() || target.title.trim() || topic;
    setGeneratingSlideId(target.id);
    setError("");
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, topic }),
      });
      const data = (await res.json().catch(() => ({}))) as { image?: string; provider?: string; error?: string };
      if (!res.ok || !data.image) {
        throw new Error(data.error ?? (isKk ? "Сурет жасау мүмкін болмады" : "Не удалось сгенерировать картинку"));
      }
      const updated = slidesRef.current.map((sl) =>
        sl.id === target.id
          ? { ...sl, imagePrompt: sl.imagePrompt || promptText, imageDataUri: data.image! }
          : sl,
      );
      update(updated);
      if (data.provider) {
        setImageProviders((prev) => ({ ...prev, [target.id]: data.provider! }));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : (isKk ? "Сурет қатесі" : "Ошибка генерации картинки"));
      return false;
    } finally {
      setGeneratingSlideId(null);
    }
  }

  async function generateAllImages() {
    const targets = slidesRef.current
      .filter((sl) => SLIDE_FIELDS[sl.kind].includes("imagePrompt") && sl.imagePrompt.trim() && !sl.imageDataUri)
      .slice(0, MAX_DECK_AI_IMAGES);
    if (targets.length === 0) {
      setMessage(
        isKk
          ? "Сурет сипаттамасы бар барлық слайдта сурет дайын (немесе сипаттама қосыңыз)."
          : "Для всех слайдов с описанием картинки уже готовы (или добавьте описание в правой панели).",
      );
      return;
    }
    setError("");
    setMessage("");
    let okCount = 0;
    for (let i = 0; i < targets.length; i += 1) {
      setBatchImgProgress(`${i + 1}/${targets.length}`);
      const ok = await requestImageForSlide(targets[i]!);
      if (ok) okCount += 1;
    }
    setBatchImgProgress(null);
    setMessage(
      isKk
        ? `Дайын иллюстрациялар: ${okCount} / ${targets.length}. Олар көрсетілімде де, PowerPoint файлында да сақталады.`
        : `Готово иллюстраций: ${okCount} из ${targets.length}. Они сразу видны на доске и встроятся в PowerPoint.`,
    );
  }

  async function analyze() {
    setAnalyzing(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/materials/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const data = (await res.json().catch(() => ({}))) as { slides?: DeckSlide[]; fromAi?: boolean; error?: string };
      if (!res.ok || !data.slides) throw new Error(data.error ?? "Не удалось разобрать план");
      update(data.slides);
      setSelected(0);
      if (!data.fromAi) setMessage("ИИ сейчас недоступен, поэтому слайды собраны прямо из полей КСП. Дополните их или повторите позже.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAnalyzing(false);
    }
  }

  async function build() {
    setBuilding(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/materials/deck/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, theme, slides: slides.map(clean) }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось собрать презентацию");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `Презентация - ${topic}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const [created, wanted] = (res.headers.get("X-Deck-Images") ?? "0/0").split("/").map(Number);
      setMessage(wanted && created !== wanted
        ? `Презентация скачана. Картинок получилось ${created} из ${wanted}: сервис изображений ответил не на все.`
        : "Презентация скачана. Откройте её в PowerPoint и запустите показ: элементы появляются сами, ответы в тестах по клику.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBuilding(false);
    }
  }

  async function buildWithPresenton() {
    setPresentonBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/materials/presenton", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          template: presentonTemplate,
          slideCount: slides.length > 0 ? Math.min(12, Math.max(4, slides.length)) : presentonSlides,
          ...(slides.length > 0 ? { slides: slides.map(clean) } : {}),
        }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? "Не удалось сгенерировать презентацию");
      }
      const engine = res.headers.get("X-Deck-Engine");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `Презентация AI - ${topic}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(
        engine === "presenton-v3"
          ? isKk
            ? "Дизайнерлік .pptx презентациясы жүктелді (Presenton AI)."
            : "Дизайнерская презентация .pptx успешно создана и скачана (Presenton AI)!"
          : isKk
            ? "Презентация .pptx жүктелді."
            : "Презентация .pptx скачана.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPresentonBusy(false);
    }
  }

  const current = slides[Math.min(selected, slides.length - 1)];

  function patch(change: Partial<DeckSlide>) {
    if (!current) return;
    update(slides.map((slide) => (slide.id === current.id ? { ...slide, ...change } : slide)));
  }

  function move(delta: number) {
    const target = selected + delta;
    if (!current || target < 0 || target >= slides.length) return;
    const next = [...slides];
    next.splice(selected, 1);
    next.splice(target, 0, current);
    update(next);
    setSelected(target);
  }

  function remove() {
    if (slides.length <= 1) return;
    update(slides.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
  }

  function add() {
    const slide: DeckSlide = {
      id: makeSlideId(),
      kind: newKind,
      title: slideKindLabel(newKind, isKk ? "kk" : "ru"),
      lead: "",
      steps: [],
      points: [],
      takeaway: "",
      options: [],
      correctIndex: null,
      notes: "",
      imagePrompt: "",
      imageDataUri: "",
    };
    const next = [...slides];
    next.splice(selected + 1, 0, slide);
    update(next);
    setSelected(selected + 1);
  }

  const missingImagesCount = slides.filter(
    (sl) => SLIDE_FIELDS[sl.kind].includes("imagePrompt") && sl.imagePrompt.trim() && !sl.imageDataUri,
  ).length;
  const anyBusy = analyzing || building || presentonBusy || Boolean(batchImgProgress);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>{isKk ? "Презентация конструкторы" : "Конструктор презентации"}</h1>
          <p>{topic}</p>
        </div>
        <Link className={s.back} href={`/plans/${planId}#materials`}>
          {isKk ? "Сабаққа оралу" : "Вернуться к уроку"}
        </Link>
      </header>

      {slides.length === 0 ? (
        <section className={s.start}>
          <div className={s.startSteps}>
            <div className={s.startStep}>
              <b>{isKk ? "1. ҚМЖ талдауы" : "1. Анализ КСП"}</b>
              {isKk
                ? "ЖИ мақсаттарды, сабақ барысын және тапсырмаларды оқып, слайдтар ұсынады."
                : "ИИ читает цели, ход урока и задания и предлагает слайды."}
            </div>
            <div className={s.startStep}>
              <b>{isKk ? "2. Конструктор" : "2. Конструктор"}</b>
              {isKk
                ? "Мәтінді, макеттерді және слайдтар ретін өзіңізге ыңғайлап өзгертесіз."
                : "Вы меняете текст, макеты и порядок, выбираете тему."}
            </div>
            <div className={s.startStep}>
              <b>3. PowerPoint</b>
              {isKk
                ? "Суреттері, ауысулары және анимациясы бар дайын .pptx файлы."
                : "Файл с картинками, переходами и появлением элементов."}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={analyze} disabled={analyzing || presentonBusy}>
              {analyzing ? (
                <>
                  <Loader2 className="animate-spin" />{" "}
                  {isKk ? "Жоспар талдануда…" : "Разбираем план…"}
                </>
              ) : (
                <>
                  <Sparkles />{" "}
                  {isKk ? "ҚМЖ негізінде слайдтар ұсыну (Конструктор)" : "Разобрать план и править слайды вручную"}
                </>
              )}
            </Button>
          </div>

          <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left text-sm">
            <div className="font-semibold">
              {isKk
                ? "✨ Немесе дайын дизайнерлік .pptx презентациясын 1 батырмамен жасау (Presenton AI)"
                : "✨ Или скачайте готовую дизайнерскую презентацию .pptx в 1 клик (Presenton AI)"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isKk
                ? "ЖИ сабақ жоспары бойынша иллюстрациялары мен заманауи версткасы бар толық өңделетін PowerPoint файлын жинайды."
                : "ИИ оформит цели, этапы урока и задания в современном дизайнерском шаблоне с иллюстрациями (редактируемый PowerPoint)."}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-medium">
                {isKk ? "Дизайн үлгісі" : "Шаблон дизайна"}
                <select
                  value={presentonTemplate}
                  onChange={(e) => setPresentonTemplate(e.target.value as PresentonTemplateId)}
                  disabled={presentonBusy}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {PRESENTON_TEMPLATES.map((tpl) => (
                    <option key={tpl} value={tpl}>
                      {PRESENTON_TEMPLATE_LABELS[tpl][isKk ? "kk" : "ru"]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                {isKk ? "Слайдтар саны" : "Слайдов"}
                <select
                  value={presentonSlides}
                  onChange={(e) => setPresentonSlides(Number(e.target.value))}
                  disabled={presentonBusy}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {[6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => void buildWithPresenton()}
                disabled={presentonBusy || analyzing}
              >
                {presentonBusy ? (
                  <>
                    <Loader2 className="animate-spin" />{" "}
                    {isKk ? "Дизайн жасалуда (~20 с)…" : "Создаём дизайн (~20 с)…"}
                  </>
                ) : (
                  <>
                    <Presentation />{" "}
                    {isKk ? "Дизайнерлік .pptx жүктеу" : "Скачать дизайнерский .pptx (AI)"}
                  </>
                )}
              </Button>
            </div>
          </div>
          {message && <p role="status" className={s.note}>{message}</p>}
          {error && <p role="alert" className={s.error}>{error}</p>}
        </section>
      ) : (
        <>
          <div className={s.toolbar}>
            <div className={s.themes} role="radiogroup" aria-label={isKk ? "Безендіру тақырыбы" : "Тема презентации"}>
              {isKk ? "Безендіру:" : "Тема:"}
              {DECK_THEMES.map((name) => (
                <button key={name} type="button" role="radio" aria-checked={theme === name} className={`${s.theme} ${theme === name ? s.themeOn : ""}`} onClick={() => { setTheme(name); saveDraft(key, { slides, theme: name }); scheduleServerSave(slides, name); }}>
                  <span className={s.swatch} style={{ background: hex(DECK_PALETTES[name].accent) }} />{THEME_LABELS[name][isKk ? "kk" : "ru"]}
                </button>
              ))}
            </div>
            {saveState !== "idle" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {saveState === "saving" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {isKk ? "Сақталуда…" : "Сохранение черновика…"}
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    {isKk ? "Жоба сақталды" : "Черновик сохранён"}
                  </>
                )}
              </span>
            )}
            <Button variant="outline" onClick={() => setPresenting(true)} disabled={slides.length === 0}>
              <Play className="size-4" /> {isKk ? "Тақтада көрсету" : "Показать на доске"}
            </Button>
            {missingImagesCount > 0 && (
              <Button variant="outline" onClick={() => void generateAllImages()} disabled={anyBusy || Boolean(generatingSlideId)}>
                {batchImgProgress ? (
                  <><Loader2 className="animate-spin" /> {isKk ? `Суреттер ${batchImgProgress}` : `Картинки ${batchImgProgress}`}</>
                ) : (
                  <><ImageIcon className="size-4" /> {isKk ? `Барлық суреттерді салу (${Math.min(missingImagesCount, MAX_DECK_AI_IMAGES)})` : `Картинки ИИ (${Math.min(missingImagesCount, MAX_DECK_AI_IMAGES)})`}</>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={analyze} disabled={anyBusy}>{analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />} {isKk ? "Жоспардан қайта жинау" : "Заново из плана"}</Button>
            <Button variant="outline" onClick={() => void buildWithPresenton()} disabled={anyBusy}>
              {presentonBusy ? <><Loader2 className="animate-spin" /> {isKk ? "AI дизайн…" : "AI-дизайн…"}</> : <><Sparkles /> {isKk ? "Presenton AI (.pptx)" : "Дизайн AI (.pptx)"}</>}
            </Button>
            <Button onClick={build} disabled={anyBusy}>{building ? <><Loader2 className="animate-spin" /> {isKk ? "Жиналуда…" : "Собираем…"}</> : <><Presentation /> {isKk ? "Презентацияны жүктеу (.pptx)" : "Создать презентацию"}</>}</Button>
          </div>
          {message && <p role="status" className={s.note}>{message}</p>}
          {error && <p role="alert" className={s.error}>{error}</p>}

          <div className={s.workspace}>
            <nav className={s.rail} aria-label={isKk ? "Слайдтар" : "Слайды"}>
              {slides.map((slide, i) => (
                <button key={slide.id} type="button" aria-current={i === selected} className={`${s.thumb} ${i === selected ? s.thumbOn : ""}`} onClick={() => setSelected(i)}>
                  <SlideView slide={slide} theme={theme} isKk={isKk} />
                  <span className={s.thumbLabel}>{i + 1}. {slideKindLabel(slide.kind, isKk ? "kk" : "ru")}</span>
                </button>
              ))}
              <div className={s.addRow}>
                <select className={s.select} aria-label={isKk ? "Жаңа слайд макеті" : "Макет нового слайда"} value={newKind} onChange={(e) => setNewKind(e.target.value as SlideKind)}>
                  {SLIDE_KINDS.map((kind) => <option key={kind} value={kind}>{slideKindLabel(kind, isKk ? "kk" : "ru")}</option>)}
                </select>
                <Button variant="outline" size="icon" onClick={add} aria-label={isKk ? "Слайд қосу" : "Добавить слайд"}><Plus /></Button>
              </div>
            </nav>
            {current && (
              <>
                <section className={s.stage} aria-label={isKk ? "Слайдты алдын ала қарау" : "Предпросмотр слайда"}>
                  <div key={`${current.id}:${theme}`}><SlideView slide={current} theme={theme} play isKk={isKk} /></div>
                  <div className={s.stageTools}>
                    <span>
                      {isKk
                        ? `${selected + 1} / ${slides.length} слайд. «Тақтада көрсету» батырмасы арқылы проекторда бірден ашуға болады.`
                        : `Слайд ${selected + 1} из ${slides.length}. Можно сразу показать на интерактивной доске или скачать в PowerPoint.`}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <Button variant="outline" size="icon" onClick={() => setPresenting(true)} aria-label={isKk ? "Осы слайдтан көрсету" : "Показать с этого слайда"} title={isKk ? "Тақтада көрсету" : "Показать на доске"}><Play className="size-4" /></Button>
                      <Button variant="outline" size="icon" onClick={() => move(-1)} disabled={selected === 0} aria-label={isKk ? "Слайдты жоғары көтеру" : "Поднять слайд"}><ArrowUp /></Button>
                      <Button variant="outline" size="icon" onClick={() => move(1)} disabled={selected === slides.length - 1} aria-label={isKk ? "Слайдты төмен түсіру" : "Опустить слайд"}><ArrowDown /></Button>
                      <Button variant="outline" size="icon" onClick={remove} disabled={slides.length <= 1} aria-label={isKk ? "Слайдты өшіру" : "Удалить слайд"}><Trash2 /></Button>
                    </span>
                  </div>
                </section>
                <SlideForm
                  slide={current}
                  isKk={isKk}
                  generatingImage={generatingSlideId === current.id}
                  imageProvider={imageProviders[current.id]}
                  onGenerateImage={() => void requestImageForSlide(current)}
                  onChange={patch}
                />
              </>
            )}
          </div>
          {presenting && slides.length > 0 && (
            <SlidePresenter
              slides={slides}
              theme={theme}
              initialIndex={selected}
              isKk={isKk}
              onClose={(lastIdx) => {
                setSelected(lastIdx);
                setPresenting(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
