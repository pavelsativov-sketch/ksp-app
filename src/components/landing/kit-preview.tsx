"use client";

import { useState } from "react";
import { ArrowUpRight, Check, FileText, Layers, Presentation } from "lucide-react";
import s from "./landing.module.css";

export function PlantIllustration({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 260 220" fill="none" role="img" aria-label="Иллюстрация растения: корни, стебель и листья">
    <circle cx="130" cy="105" r="89" fill="#E9EEFF" />
    <path d="M45 169C91 161 170 161 215 169" stroke="#C9D6F5" strokeWidth="2" strokeLinecap="round" />
    <path d="M129 173V71M129 120L93 98M129 142L165 116" stroke="#4263eb" strokeWidth="4" strokeLinecap="round" />
    <path d="M128 111C96 112 74 91 76 67C104 69 124 85 128 111Z" fill="#25c4db" />
    <path d="M132 137C161 140 187 119 187 96C158 96 137 113 132 137Z" fill="#7AD7E6" />
    <path d="M130 88C111 66 117 43 133 28C150 48 150 70 130 88Z" fill="#4263eb" />
    <path d="M129 169L123 193M128 176L145 195M125 183L105 196M137 185L154 187" stroke="#2847c7" strokeWidth="3" strokeLinecap="round" />
    <path d="M86 78L119 103M175 107L141 130" stroke="#F8FBFF" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="197" cy="49" r="18" fill="#ffc857" /><path d="M199 18V13M225 48H231M177 27L173 23" stroke="#E3A93B" strokeWidth="2" strokeLinecap="round" />
    <path d="M62 128C57 135 54 139 54 143a8 8 0 0 0 16 0C70 139 67 135 62 128Z" fill="#f59bc4" />
  </svg>;
}

const tabs = [
  { label: "КСП", icon: FileText },
  { label: "Рабочий лист", icon: Layers },
  { label: "Презентация", icon: Presentation },
];

export function KitPreview() {
  const [active, setActive] = useState(0);
  return <div className={s.previewStage} id="lesson-preview">
    <div className={s.stageTop}><span><i /> ВАШ СЛЕДУЮЩИЙ УРОК</span><span>01 / 03</span></div>
    <div className={s.orbit} aria-hidden="true" />
    <div className={s.backPaper} aria-hidden="true"><span>ЕСТЕСТВОЗНАНИЕ</span><b>Маленькое открытие.<br />Большой интерес.</b><PlantIllustration /></div>
    <div className={s.document}>
      <div className={s.docTop}><span className={s.docIcon}><FileText size={19} /></span><div><b>Мир растений</b><span>Естествознание · 3 класс · RU</span></div><span className={s.docMenu}>•••</span></div>
      <div className={s.previewTabs} role="tablist" aria-label="Материалы примера урока">{tabs.map(({ label, icon: Icon }, index) => <button key={label} type="button" role="tab" id={`kit-tab-${index}`} aria-selected={active === index} aria-controls="kit-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={(event) => { if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (active + (event.key === "ArrowRight" ? 1 : 2)) % 3; setActive(next); document.getElementById(`kit-tab-${next}`)?.focus(); } }}><Icon size={14} />{label}</button>)}</div>
      <div id="kit-panel" role="tabpanel" aria-labelledby={`kit-tab-${active}`} className={s.docContent} tabIndex={0}>
        {active === 0 ? <><div className={s.docEyebrow}>КРАТКОСРОЧНЫЙ ПЛАН</div><h3>Как устроено растение?</h3><p className={s.docGoal}>Учимся различать части растения и объяснять, для чего они нужны.</p><div className={s.lessonRow}><span>01</span><div><b>Пробуждаем интерес</b><p>Что общего у дерева и ромашки?</p></div><small>5 мин</small></div><div className={s.lessonRow}><span>02</span><div><b>Исследуем вместе</b><p>Находим корень, стебель и листья.</p></div><small>25 мин</small></div><div className={s.lessonRow}><span>03</span><div><b>Делаем открытие</b><p>Объясняем роль каждой части.</p></div><small>10 мин</small></div><div className={s.docCheck}><Check size={14} /> Критерии оценивания и рефлексия</div></> : active === 1 ? <><div className={s.docEyebrow}>РАБОЧИЙ ЛИСТ · ЗАДАНИЕ 01</div><h3>Знакомьтесь: растение</h3><div className={s.worksheetPlant}><PlantIllustration /><div><span>01 — Корень</span><span>02 — Стебель</span><span>03 — Лист</span></div></div><p className={s.docGoal}>Соедини название с частью растения. Расскажи, как корень помогает ему жить.</p></> : <><div className={s.docEyebrow}>ПРЕЗЕНТАЦИЯ · СЛАЙД 01</div><div className={s.miniSlide}><span>МИР ВОКРУГ НАС</span><h3>У каждого листа<br />есть своя работа.</h3><PlantIllustration /></div><p className={s.slideCaption}>Вопрос классу: может ли растение жить без корней?</p></>}
      </div>
      <div className={s.docBottom}><span><i /> Редактируемый пример</span><span>{active === 2 ? ".pptx" : ".docx"} <ArrowUpRight size={13} /></span></div>
    </div>
    <div className={s.readyBadge}><span><Check size={20} /></span><div><b>Одна тема. Целый комплект.</b><small>Останется добавить ваш подход</small></div></div>
    <p className={s.stageNote}>Попробуйте переключить материалы <span aria-hidden="true">↗</span></p>
  </div>;
}
