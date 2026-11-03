"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, Plus, Presentation, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DECK_PALETTES, DECK_THEMES, SLIDE_FIELDS, SLIDE_KINDS, SLIDE_KIND_LABELS, type DeckSlide, type DeckTheme, type SlideKind } from "@/lib/materials/deck-types";
import s from "./deck-builder.module.css";

const THEME_LABELS: Record<DeckTheme, string> = { network: "Сеть", lavender: "Лаванда", ocean: "Океан", sunset: "Закат" };
const hex = (color: string) => `#${color}`;

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
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Черновик в браузере необязателен: презентацию можно собрать и без него.
  }
}

/** Похожий на итоговый слайд показ: размеры в долях ширины, поэтому годится и для миниатюры. */
function SlideView({ slide, theme, play = false }: { slide: DeckSlide; theme: DeckTheme; play?: boolean }) {
  const p = DECK_PALETTES[theme];
  const tone = (i: number) => hex(p.tones[i % p.tones.length]!);
  const light = { background: hex(p.soft), color: hex(p.ink) };
  const title = <div className={s.sTitle}>{slide.title}</div>;
  const centerTitle = <div className={`${s.sTitle} ${s.center}`}>{slide.title}</div>;
  const band = slide.takeaway ? <div className={s.band} style={{ background: hex(p.band) }}>{slide.takeaway}</div> : null;
  const picture = slide.imagePrompt ? <div className={s.picture}>Картинка ИИ: {slide.imagePrompt}</div> : null;
  let body;
  switch (slide.kind) {
    case "title":
      body = <><div className={s.grow} style={{ justifyContent: "center" }}><div className={s.sTitle} style={{ fontSize: "5.4cqw", maxWidth: "62%" }}>{slide.title}</div><div className={s.sLead} style={{ color: hex(p.accent), fontWeight: 700, fontSize: "3cqw" }}>{slide.lead}</div></div></>;
      break;
    case "mood":
      body = <>{centerTitle}<div className={s.grid2}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i) }}>{point}</div>)}</div></>;
      break;
    case "guess":
      body = <>{centerTitle}{picture}<div className={s.row}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}>{point}</div>)}</div></>;
      break;
    case "goals":
      body = <>{title}<div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.row}><div className={s.box} style={{ flex: "0 0 7cqw", background: tone(i) }}>{i + 1}</div><div className={`${s.box} ${s.boxLight}`} style={light}>{point}</div></div>)}</div></>;
      break;
    case "flow":
      body = <>{title}<div className={s.sLead} style={{ color: hex(p.muted) }}>{slide.lead}</div>
        <div className={s.row}>{slide.steps.flatMap((step, i) => [<div key={i} className={`${s.box} ${s.tall}`} style={{ background: tone(i) }}>{step}</div>, i < slide.steps.length - 1 ? <span key={`a${i}`} className={s.arrow} style={{ color: hex(p.accent) }}>➜</span> : null])}</div>
        <div className={s.row} style={{ flex: 1, alignItems: "stretch" }}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={{ background: "#fff", color: hex(p.ink), border: `1px solid ${tone(i)}` }}>{point}</div>)}</div></>;
      break;
    case "list":
      body = <>{title}<div className={s.split} style={{ paddingBottom: slide.takeaway ? "7cqw" : 0 }}><div className={s.grow} style={{ justifyContent: "space-around" }}>{slide.points.map((point, i) => <div key={i} className={s.bullet}>•  {point}</div>)}</div>{picture}</div>{band}</>;
      break;
    case "cards":
      body = <>{title}<div className={slide.points.length <= 4 ? s.grid2 : s.grid3} style={{ marginBottom: slide.takeaway ? "7cqw" : 0 }}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i), fontSize: "2.5cqw" }}>{point}</div>)}</div>{band}</>;
      break;
    case "question":
      body = <><div className={s.bubble} style={{ background: hex(p.accent) }}>{slide.title}</div><div className={s.row} style={{ flex: 1, alignItems: "stretch" }}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}>{point}</div>)}</div></>;
      break;
    case "quiz":
      body = <>{title}<div className={s.grid2}>{slide.options.map((option, i) => <div key={i} className={s.box} style={{ ...light, border: `0.4cqw solid ${i === slide.correctIndex ? "#2fa45f" : tone(i)}`, fontSize: "2.6cqw" }}>{"АБВГ"[i]}. {option}</div>)}</div></>;
      break;
    case "activity":
      body = <>{centerTitle}<div className={`${s.sLead} ${s.center}`} style={{ color: hex(p.accent), fontWeight: 700 }}>{slide.lead}</div><div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={s.box} style={{ background: tone(i), textAlign: "left", placeItems: "center start" }}>{i + 1}. {point}</div>)}</div></>;
      break;
    case "reflection":
      body = <>{centerTitle}<div className={s.grid3}>{slide.points.slice(0, 3).map((point, i) => <div key={i} className={s.center} style={{ fontSize: "2.6cqw", fontWeight: 700 }}><div className={s.light} style={{ background: ["#35b34a", "#2f7bf0", "#e5352d"][i] }} />{point}</div>)}</div></>;
      break;
    case "homework":
      body = <>{centerTitle}<div className={s.grow}>{slide.points.map((point, i) => <div key={i} className={`${s.box} ${s.boxLight}`} style={light}>{point}</div>)}</div></>;
      break;
    case "thanks":
      body = <div className={s.grow} style={{ justifyContent: "center", color: "#fff" }}><div className={`${s.sTitle} ${s.center}`} style={{ fontSize: "7cqw" }}>{slide.title}</div><div className={`${s.sLead} ${s.center}`}>{slide.lead}</div></div>;
      break;
  }
  const background = slide.kind === "title" ? hex(p.soft) : slide.kind === "thanks" ? hex(p.accent) : "#fff";
  return <div className={s.slide} style={{ background, color: hex(p.ink) }}><div className={`${s.inner} ${play ? s.play : ""}`}>{body}</div></div>;
}

function SlideForm({ slide, onChange }: { slide: DeckSlide; onChange: (patch: Partial<DeckSlide>) => void }) {
  const fields = SLIDE_FIELDS[slide.kind];
  const has = (name: (typeof fields)[number]) => fields.includes(name);
  return (
    <div className={s.form}>
      <label className={s.field}>Макет
        <select className={s.select} value={slide.kind} onChange={(e) => onChange({ kind: e.target.value as SlideKind })}>
          {SLIDE_KINDS.map((kind) => <option key={kind} value={kind}>{SLIDE_KIND_LABELS[kind]}</option>)}
        </select>
      </label>
      <label className={s.field}>{slide.kind === "quiz" || slide.kind === "question" ? "Вопрос" : "Заголовок"}
        <textarea rows={2} maxLength={200} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      {has("lead") && <label className={s.field}>Подзаголовок<input maxLength={400} value={slide.lead} onChange={(e) => onChange({ lead: e.target.value })} /></label>}
      {has("steps") && <label className={s.field}>Блоки схемы, по одному в строке<textarea rows={3} value={slide.steps.join("\n")} onChange={(e) => onChange({ steps: e.target.value.split("\n").slice(0, 4) })} /></label>}
      {has("points") && <label className={s.field}>{slide.kind === "reflection" ? "Подписи светофора" : "Пункты"}, по одному в строке<textarea rows={5} value={slide.points.join("\n")} onChange={(e) => onChange({ points: e.target.value.split("\n").slice(0, 8) })} /></label>}
      {has("takeaway") && <label className={s.field}>Итог на плашке внизу<input maxLength={160} value={slide.takeaway} onChange={(e) => onChange({ takeaway: e.target.value })} placeholder="X = Y" /></label>}
      {has("options") && (
        <fieldset className={s.field}>
          <legend>Варианты, отметьте верный. Он подсветится по клику</legend>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.optionRow}>
              <input type="radio" style={{ width: "auto" }} name={`correct-${slide.id}`} checked={slide.correctIndex === i} onChange={() => onChange({ correctIndex: i })} aria-label={`Вариант ${i + 1} верный`} />
              <input aria-label={`Вариант ${i + 1}`} maxLength={400} value={slide.options[i] ?? ""} onChange={(e) => { const next = [...slide.options]; next[i] = e.target.value; onChange({ options: next }); }} />
            </div>
          ))}
        </fieldset>
      )}
      {has("imagePrompt") && <label className={s.field}>Картинка: что нарисовать, лучше по-английски<textarea rows={2} maxLength={600} value={slide.imagePrompt} onChange={(e) => onChange({ imagePrompt: e.target.value })} /><span className={s.hint}>Пустое поле: слайд без картинки.</span></label>}
      <label className={s.field}>Заметки учителя<textarea rows={3} maxLength={2000} value={slide.notes} onChange={(e) => onChange({ notes: e.target.value })} /><span className={s.hint}>Видны только докладчику в PowerPoint.</span></label>
    </div>
  );
}

function clean(slide: DeckSlide): DeckSlide {
  return { ...slide, steps: lines(slide.steps.join("\n")), points: lines(slide.points.join("\n")), options: slide.options.map((option) => option.trim()).filter(Boolean) };
}

/** Конструктор: ИИ разбирает КСП и предлагает слайды, учитель правит, затем собирается PowerPoint. */
export function DeckBuilder({ planId, topic }: { planId: string; topic: string }) {
  const key = `deck:${planId}`;
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [theme, setTheme] = useState<DeckTheme>("network");
  const [selected, setSelected] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newKind, setNewKind] = useState<SlideKind>("list");

  // Черновик живёт в браузере: читаем после гидратации, иначе разметка не совпадёт с серверной.
  useEffect(() => {
    const draft = loadDraft(key);
    if (!draft?.slides?.length) return;
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage недоступен при серверной отрисовке */
    setSlides(draft.slides);
    setTheme(draft.theme);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);

  function update(next: DeckSlide[], nextTheme = theme) {
    setSlides(next);
    saveDraft(key, { slides: next, theme: nextTheme });
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
    const slide: DeckSlide = { id: `n${Date.now().toString(36)}`, kind: newKind, title: SLIDE_KIND_LABELS[newKind], lead: "", steps: [], points: [], takeaway: "", options: [], correctIndex: null, notes: "", imagePrompt: "" };
    const next = [...slides];
    next.splice(selected + 1, 0, slide);
    update(next);
    setSelected(selected + 1);
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Конструктор презентации</h1>
          <p>{topic}</p>
        </div>
        <Link className={s.back} href={`/plans/${planId}#materials`}>Вернуться к уроку</Link>
      </header>

      {slides.length === 0 ? (
        <section className={s.start}>
          <div className={s.startSteps}>
            <div className={s.startStep}><b>1. Анализ КСП</b>ИИ читает цели, ход урока и задания и предлагает слайды.</div>
            <div className={s.startStep}><b>2. Конструктор</b>Вы меняете текст, макеты и порядок, выбираете тему.</div>
            <div className={s.startStep}><b>3. PowerPoint</b>Файл с картинками, переходами и появлением элементов.</div>
          </div>
          <Button onClick={analyze} disabled={analyzing}>
            {analyzing ? <><Loader2 className="animate-spin" /> Разбираем план…</> : <><Sparkles /> Разобрать план и предложить слайды</>}
          </Button>
          {error && <p role="alert" className={s.error}>{error}</p>}
        </section>
      ) : (
        <>
          <div className={s.toolbar}>
            <div className={s.themes} role="radiogroup" aria-label="Тема презентации">
              Тема:
              {DECK_THEMES.map((name) => (
                <button key={name} type="button" role="radio" aria-checked={theme === name} className={`${s.theme} ${theme === name ? s.themeOn : ""}`} onClick={() => { setTheme(name); saveDraft(key, { slides, theme: name }); }}>
                  <span className={s.swatch} style={{ background: hex(DECK_PALETTES[name].accent) }} />{THEME_LABELS[name]}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={analyze} disabled={analyzing || building}>{analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />} Заново из плана</Button>
            <Button onClick={build} disabled={building || analyzing}>{building ? <><Loader2 className="animate-spin" /> Собираем…</> : <><Presentation /> Создать презентацию</>}</Button>
          </div>
          {message && <p role="status" className={s.note}>{message}</p>}
          {error && <p role="alert" className={s.error}>{error}</p>}

          <div className={s.workspace}>
            <nav className={s.rail} aria-label="Слайды">
              {slides.map((slide, i) => (
                <button key={slide.id} type="button" aria-current={i === selected} className={`${s.thumb} ${i === selected ? s.thumbOn : ""}`} onClick={() => setSelected(i)}>
                  <SlideView slide={slide} theme={theme} />
                  <span className={s.thumbLabel}>{i + 1}. {SLIDE_KIND_LABELS[slide.kind]}</span>
                </button>
              ))}
              <div className={s.addRow}>
                <select className={s.select} aria-label="Макет нового слайда" value={newKind} onChange={(e) => setNewKind(e.target.value as SlideKind)}>
                  {SLIDE_KINDS.map((kind) => <option key={kind} value={kind}>{SLIDE_KIND_LABELS[kind]}</option>)}
                </select>
                <Button variant="outline" size="icon" onClick={add} aria-label="Добавить слайд"><Plus /></Button>
              </div>
            </nav>
            {current && (
              <>
                <section className={s.stage} aria-label="Предпросмотр слайда">
                  <div key={`${current.id}:${theme}`}><SlideView slide={current} theme={theme} play /></div>
                  <div className={s.stageTools}>
                    <span>Слайд {selected + 1} из {slides.length}. В PowerPoint элементы появляются так же, по очереди.</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <Button variant="outline" size="icon" onClick={() => move(-1)} disabled={selected === 0} aria-label="Поднять слайд"><ArrowUp /></Button>
                      <Button variant="outline" size="icon" onClick={() => move(1)} disabled={selected === slides.length - 1} aria-label="Опустить слайд"><ArrowDown /></Button>
                      <Button variant="outline" size="icon" onClick={remove} disabled={slides.length <= 1} aria-label="Удалить слайд"><Trash2 /></Button>
                    </span>
                  </div>
                </section>
                <SlideForm slide={current} onChange={patch} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
