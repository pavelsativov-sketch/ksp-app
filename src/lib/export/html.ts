/**
 * Offline HTML export for interactive tasks.
 *
 * Generates a single self-contained `interactive.html` that plays every task
 * from the plan without a server. The file works via `file://` (double-click),
 * has no CDN deps, and persists student answers in localStorage.
 */

import type { LessonPlanRow } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";

interface FlatTask {
  stageKey: "beginning" | "middle" | "end";
  stageTitle: string;
  task: InteractiveTask;
}

export function flattenTasks(plan: LessonPlanRow): FlatTask[] {
  const stages = plan.content.stages;
  const out: FlatTask[] = [];
  for (const [key, title] of [
    ["beginning", "Начало урока"],
    ["middle", "Середина урока"],
    ["end", "Конец урока"],
  ] as const) {
    for (const task of stages[key].tasks ?? []) {
      out.push({ stageKey: key, stageTitle: title, task });
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonSafe(data: unknown): string {
  // Safe inline JSON: avoid breaking out of a <script> tag.
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildInteractiveHtml(plan: LessonPlanRow): string {
  const flat = flattenTasks(plan);
  const payload = {
    planId: plan.id,
    title: plan.title,
    topic: plan.content.topic,
    grade: plan.grade,
    tasks: flat.map((f, i) => ({
      n: i + 1,
      stageKey: f.stageKey,
      stageTitle: f.stageTitle,
      task: f.task,
    })),
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(plan.title)} — интерактивные задания</title>
<style>${CSS}</style>
</head>
<body>
<header class="hdr">
  <div>
    <div class="eyebrow">ИНТЕРАКТИВНЫЕ ЗАДАНИЯ</div>
    <h1>${escapeHtml(plan.title)}</h1>
    <div class="sub">${escapeHtml(plan.content.topic || "")} · ${plan.grade} класс</div>
  </div>
  <div class="score-hdr">
    <div class="score-label">Баллы</div>
    <div class="score-val"><span id="score-cur">0</span> / <span id="score-max">0</span></div>
  </div>
</header>

<main id="app">
  <aside class="nav" id="nav"></aside>
  <section class="stage" id="stage"></section>
</main>

<footer class="ftr">
  <button id="reset" class="btn btn-ghost" type="button">Сбросить прогресс</button>
  <span class="muted">Ответы сохраняются в браузере. Файл работает офлайн.</span>
</footer>

<div id="confetti-canvas"></div>

<script>window.__KSP_DATA__ = ${jsonSafe(payload)};</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`;
}

// --- CSS -------------------------------------------------------------------

const CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 24px;background:linear-gradient(135deg,#fff7ed,#fdf2f8);border-bottom:1px solid #e2e8f0}
.eyebrow{font-size:11px;letter-spacing:.12em;color:#64748b;font-weight:600;margin-bottom:4px}
.hdr h1{margin:0;font-size:22px;font-weight:700}
.sub{color:#475569;font-size:14px;margin-top:4px}
.score-hdr{text-align:right}
.score-label{font-size:11px;letter-spacing:.12em;color:#64748b;text-transform:uppercase;font-weight:600}
.score-val{font-size:28px;font-weight:700;color:#0f172a}
main#app{display:grid;grid-template-columns:280px 1fr;gap:0;min-height:calc(100vh - 152px)}
@media(max-width:720px){main#app{grid-template-columns:1fr}.nav{border-right:none!important;border-bottom:1px solid #e2e8f0}}
.nav{border-right:1px solid #e2e8f0;background:#fff;padding:12px}
.nav ol{list-style:none;padding:0;margin:0}
.nav li{margin:0}
.nav button{all:unset;cursor:pointer;display:flex;gap:10px;padding:10px 12px;border-radius:8px;width:100%;font-size:14px;align-items:flex-start;transition:background .15s}
.nav button:hover{background:#f1f5f9}
.nav button.active{background:#0f172a;color:#fff}
.nav button.active .muted{color:#cbd5e1}
.nav .num{flex:0 0 24px;height:24px;border-radius:50%;background:#e2e8f0;color:#0f172a;text-align:center;font-size:12px;font-weight:600;line-height:24px}
.nav button.active .num{background:#475569;color:#fff}
.nav button.done .num{background:#16a34a;color:#fff}
.nav button.wrong .num{background:#dc2626;color:#fff}
.nav .stage-lbl{display:block;font-size:11px;letter-spacing:.08em;color:#64748b;text-transform:uppercase;font-weight:600;margin-top:14px;margin-bottom:4px;padding:0 10px}
.stage{padding:24px;max-width:920px}
.task-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.task-card.shake{animation:shake .35s ease-in-out}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.task-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.task-meta{font-size:11px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.task-q{font-size:17px;font-weight:600;margin:8px 0 16px 0}
.task-timer{font-variant-numeric:tabular-nums;font-size:14px;color:#475569}
.task-timer.urgent{color:#dc2626;font-weight:700;animation:pulse .8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.opt-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.opt{display:flex;gap:10px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s}
.opt:hover{border-color:#94a3b8;background:#f1f5f9}
.opt.sel{background:#eff6ff;border-color:#3b82f6}
.opt input{pointer-events:none}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.input{font:inherit;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;width:100%;max-width:280px}
.input:focus{outline:2px solid #3b82f6;outline-offset:-1px;border-color:#3b82f6}
.actions{display:flex;gap:8px;margin-top:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.btn{font:inherit;cursor:pointer;padding:10px 16px;border-radius:8px;border:none;font-weight:500;display:inline-flex;align-items:center;gap:6px;transition:background .15s,opacity .15s}
.btn-primary{background:#0f172a;color:#fff}
.btn-primary:hover{background:#1e293b}
.btn-ghost{background:transparent;color:#475569}
.btn-ghost:hover{background:#f1f5f9}
.btn-outline{background:#fff;color:#0f172a;border:1px solid #cbd5e1}
.btn-outline:hover{background:#f8fafc}
.btn-warm{background:#f59e0b;color:#fff}
.btn-warm:hover{background:#d97706}
.btn[disabled]{opacity:.4;cursor:not-allowed}
.feedback{margin-top:16px;padding:14px 16px;border-radius:8px;font-size:14px}
.feedback.ok{background:#f0fdf4;border:1px solid #86efac;color:#14532d}
.feedback.err{background:#fef2f2;border:1px solid #fca5a5;color:#7f1d1d}
.feedback .pts{font-weight:700;margin-bottom:4px}
.hint-box{margin-top:12px;padding:10px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;color:#78350f;font-size:14px}
.tf{display:flex;gap:8px;flex-wrap:wrap}
.tf .opt{flex:1 1 0;min-width:140px;justify-content:center;font-weight:500}
.ftr{padding:16px 24px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:16px;align-items:center}
.muted{color:#94a3b8;font-size:13px}
.matching{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:720px){.matching{grid-template-columns:1fr}}
.slots,.tray{display:grid;gap:8px}
.slots .slot{min-height:56px;padding:10px;border:2px dashed #cbd5e1;border-radius:8px;background:#fff}
.slots .slot.over{border-color:#0f172a;background:#f1f5f9}
.slots .slot .left-label{font-size:13px;color:#475569;margin-bottom:4px}
.tray{min-height:80px;padding:10px;border:2px dashed #cbd5e1;border-radius:8px;background:#f8fafc;align-content:start}
.chip{padding:8px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:grab;user-select:none;font-size:14px}
.chip.dragging{opacity:.5}
.chip[draggable=false]{cursor:default}
.ordering-list{display:grid;gap:6px}
.ord-item{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
.ord-item .handle{cursor:grab;color:#94a3b8;font-size:18px;line-height:1}
.ord-item.dragging{opacity:.5}
.ord-controls{margin-left:auto;display:flex;gap:4px}
.ord-controls button{all:unset;cursor:pointer;width:28px;height:28px;text-align:center;border:1px solid #cbd5e1;border-radius:6px;color:#64748b;background:#fff;font-size:16px;line-height:26px}
.ord-controls button:hover{background:#f1f5f9}
.fill-template{font-size:17px;line-height:2.2}
.fill-template input{border:none;border-bottom:2px solid #94a3b8;padding:2px 6px;font:inherit;width:120px;background:transparent;color:#0f172a}
.fill-template input:focus{outline:none;border-color:#3b82f6}
.final{text-align:center;padding:40px 24px}
.final .emoji{font-size:64px;margin-bottom:8px}
.final .big{font-size:36px;font-weight:700}
.final .tier{color:#475569;margin-top:4px;font-size:16px}
.breakdown{margin:24px auto 0;max-width:520px;text-align:left}
.breakdown li{display:flex;justify-content:space-between;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:14px}
.breakdown li .sc{font-variant-numeric:tabular-nums;font-weight:600}
#confetti-canvas{position:fixed;inset:0;pointer-events:none;z-index:100}
`;

// --- Runtime JS ------------------------------------------------------------

const RUNTIME_JS = `
(function(){
  "use strict";
  var DATA = window.__KSP_DATA__;
  var TASKS = DATA.tasks;
  var STORAGE_KEY = "ksp-interactive:" + DATA.planId;
  var state = loadState();

  function loadState(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return emptyState();
      var p = JSON.parse(raw);
      if(!p || typeof p !== "object") return emptyState();
      if(!Array.isArray(p.results) || p.results.length !== TASKS.length) return emptyState();
      return p;
    }catch(e){ return emptyState(); }
  }
  function emptyState(){
    return {
      current: 0,
      results: TASKS.map(function(){ return null; }),
      hintsUsed: TASKS.map(function(){ return 0; }),
      answers: TASKS.map(function(){ return null; }),
      finished: false
    };
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }
  function resetState(){
    if(!confirm("Сбросить все ответы и пройти заново?")) return;
    state = emptyState();
    saveState();
    render();
  }
  document.getElementById("reset").addEventListener("click", resetState);

  // ---- Evaluation ----
  function norm(s){
    return String(s||"").trim().toLocaleLowerCase("ru-RU").replace(/\\s+/g," ");
  }
  function evaluate(task, answer){
    var maxScore = Math.max(1, task.points|0);
    if(answer == null) return { ok:false, score:0, maxScore:maxScore, feedback:"Ответ не задан" };
    switch(task.type){
      case "MCQ": {
        var ok = answer.selectedIndex === task.correctIndex;
        return { ok:ok, score:ok?maxScore:0, maxScore:maxScore,
          feedback: ok ? "Верно!" : ("Неверно. Правильный ответ: «"+task.options[task.correctIndex]+"»." ) };
      }
      case "TRUE_FALSE": {
        var ok2 = answer.selected === task.correct;
        return { ok:ok2, score:ok2?maxScore:0, maxScore:maxScore,
          feedback: ok2 ? "Верно!" : ("Неверно. Правильный ответ: «"+(task.correct?"Верно":"Неверно")+"»." ) };
      }
      case "SHORT_ANSWER": {
        var user = norm(answer.text||"");
        var ok3 = (task.acceptedAnswers||[]).some(function(x){ return norm(x)===user; });
        return { ok:ok3, score:ok3?maxScore:0, maxScore:maxScore,
          feedback: ok3 ? "Верно!" : ("Неверно. Ожидаемый ответ: «"+(task.acceptedAnswers[0]||"")+"»." ) };
      }
      case "FILL_BLANK": {
        var fills = answer.fillers||[];
        if(fills.length !== task.answers.length)
          return { ok:false, score:0, maxScore:maxScore, feedback:"Заполните все пропуски" };
        var correct = 0;
        for(var i=0;i<task.answers.length;i++) if(norm(task.answers[i])===norm(fills[i]||"")) correct++;
        var ok4 = correct === task.answers.length;
        var score4 = Math.round((correct/task.answers.length)*maxScore);
        return { ok:ok4, score:score4, maxScore:maxScore,
          feedback: ok4 ? "Все пропуски заполнены верно!" : ("Правильно: "+correct+" из "+task.answers.length+".") };
      }
      case "MATCHING": {
        var pairs = answer.pairs||[];
        var expected = {};
        task.pairs.forEach(function(p){ expected[p.leftIndex]=p.rightIndex; });
        var matched = pairs.filter(function(p){ return expected[p.leftIndex]===p.rightIndex; }).length;
        var ok5 = matched===task.pairs.length && pairs.length===task.pairs.length;
        var score5 = Math.round((matched/Math.max(1,task.pairs.length))*maxScore);
        return { ok:ok5, score:score5, maxScore:maxScore,
          feedback: ok5 ? "Все пары соотнесены верно!" : ("Правильно соотнесено: "+matched+" из "+task.pairs.length+".") };
      }
      case "ORDERING": {
        var order = answer.order||[];
        var ok6 = order.length===task.correctOrder.length &&
          order.every(function(v,i){ return v===task.correctOrder[i]; });
        var correct6 = 0;
        task.correctOrder.forEach(function(v,i){ if(order[i]===v) correct6++; });
        var score6 = Math.round((correct6/Math.max(1,task.correctOrder.length))*maxScore);
        return { ok:ok6, score:score6, maxScore:maxScore,
          feedback: ok6 ? "Правильная последовательность!" : ("На своих местах: "+correct6+" из "+task.correctOrder.length+".") };
      }
      case "NUMERIC": {
        var v = answer.value;
        if(v===null || isNaN(v)) return { ok:false, score:0, maxScore:maxScore, feedback:"Введите число" };
        var tol = Math.abs(task.tolerance||0);
        var ok7 = Math.abs(v - task.answer) <= tol;
        var unit = task.unit ? " "+task.unit : "";
        return { ok:ok7, score:ok7?maxScore:0, maxScore:maxScore,
          feedback: ok7 ? "Верно!" : ("Неверно. Ожидаемый ответ: "+task.answer+unit+(tol>0?" (±"+tol+")":"")+".") };
      }
    }
    return { ok:false, score:0, maxScore:maxScore, feedback:"Неизвестный тип" };
  }

  // ---- Confetti (tiny inline) ----
  var confettiCanvas = null, confettiCtx = null, confettiParticles = [];
  function ensureConfetti(){
    if(confettiCanvas) return;
    confettiCanvas = document.createElement("canvas");
    confettiCanvas.style.cssText = "position:fixed;inset:0;pointer-events:none;width:100vw;height:100vh";
    document.getElementById("confetti-canvas").appendChild(confettiCanvas);
    confettiCtx = confettiCanvas.getContext("2d");
    window.addEventListener("resize", sizeConfetti);
    sizeConfetti();
    requestAnimationFrame(loopConfetti);
  }
  function sizeConfetti(){
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  function fireConfetti(n){
    ensureConfetti();
    var colors = ["#f59e0b","#ef4444","#10b981","#3b82f6","#8b5cf6","#ec4899"];
    for(var i=0;i<n;i++){
      confettiParticles.push({
        x: window.innerWidth/2, y: window.innerHeight/3,
        vx: (Math.random()-.5)*14, vy: -Math.random()*10-4,
        g: .3, life: 0, max: 120 + Math.random()*60,
        color: colors[(Math.random()*colors.length)|0],
        size: 4 + Math.random()*4, rot: Math.random()*Math.PI*2, vr: (Math.random()-.5)*.2
      });
    }
  }
  function loopConfetti(){
    if(!confettiCtx){ return; }
    confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
    confettiParticles = confettiParticles.filter(function(p){
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life++; p.rot += p.vr;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y); confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.globalAlpha = Math.max(0, 1 - p.life/p.max);
      confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      confettiCtx.restore();
      return p.life < p.max && p.y < window.innerHeight + 50;
    });
    requestAnimationFrame(loopConfetti);
  }

  // ---- Navigation & render ----
  function go(idx){
    if(idx < 0 || idx >= TASKS.length) return;
    state.current = idx;
    state.finished = false;
    saveState();
    render();
  }
  function finish(){
    state.finished = true;
    saveState();
    render();
  }

  function totalScore(){
    var s = 0, m = 0;
    state.results.forEach(function(r, i){
      if(r){
        s += Math.max(0, r.score - 2*(state.hintsUsed[i]||0));
        m += r.maxScore;
      } else {
        m += Math.max(1, TASKS[i].task.points|0);
      }
    });
    return { score:s, max:m };
  }

  function render(){
    var t = totalScore();
    document.getElementById("score-cur").textContent = t.score;
    document.getElementById("score-max").textContent = t.max;
    renderNav();
    if(state.finished){ renderFinal(); } else { renderTask(); }
  }

  function renderNav(){
    var nav = document.getElementById("nav");
    nav.innerHTML = "";
    var lastStage = null;
    var ol = document.createElement("ol");
    TASKS.forEach(function(it, idx){
      if(it.stageTitle !== lastStage){
        var lbl = document.createElement("span");
        lbl.className = "stage-lbl";
        lbl.textContent = it.stageTitle;
        nav.appendChild(lbl);
        lastStage = it.stageTitle;
        ol = document.createElement("ol");
        nav.appendChild(ol);
      }
      var li = document.createElement("li");
      var btn = document.createElement("button");
      var active = (idx === state.current && !state.finished);
      var r = state.results[idx];
      btn.className = "nav-btn" + (active?" active":"") + (r && r.ok?" done":"") + (r && !r.ok?" wrong":"");
      btn.innerHTML = '<span class="num">'+(it.n)+'</span><span><span>'+escapeHtml(it.task.question||"Задание "+(idx+1))+'</span><br><span class="muted">'+labelFor(it.task.type)+'</span></span>';
      btn.addEventListener("click", function(){ go(idx); });
      li.appendChild(btn);
      ol.appendChild(li);
    });
    // Final link
    if(state.results.every(function(r){ return r !== null; })){
      var finalLi = document.createElement("li");
      var finalBtn = document.createElement("button");
      finalBtn.className = "nav-btn" + (state.finished?" active":"");
      finalBtn.innerHTML = '<span class="num">★</span><span><strong>Итоги</strong><br><span class="muted">Финальный экран</span></span>';
      finalBtn.addEventListener("click", finish);
      finalLi.appendChild(finalBtn);
      ol.appendChild(finalLi);
    }
  }

  function labelFor(t){
    return {MCQ:"Выбор",TRUE_FALSE:"Верно/неверно",SHORT_ANSWER:"Короткий ответ",FILL_BLANK:"Пропуск",MATCHING:"Соотнесение",ORDERING:"Порядок",NUMERIC:"Число"}[t]||t;
  }

  // ---- Task view ----
  var timerHandle = null;
  function clearTimer(){ if(timerHandle){ clearInterval(timerHandle); timerHandle = null; } }

  function renderTask(){
    clearTimer();
    var stage = document.getElementById("stage");
    var idx = state.current;
    var item = TASKS[idx];
    var task = item.task;
    var card = document.createElement("article");
    card.className = "task-card";
    card.id = "task-card";

    var head = document.createElement("header");
    head.className = "task-head";
    head.innerHTML = '<div><div class="task-meta">'+escapeHtml(item.stageTitle)+' · Задание '+item.n+' из '+TASKS.length+' · '+labelFor(task.type)+' · '+task.points+' '+plural(task.points,"балл","балла","баллов")+'</div><div class="task-q">'+escapeHtml(task.question||"")+'</div></div>';
    var timerBadge = null;
    if(task.timeLimitSec && task.timeLimitSec > 0){
      timerBadge = document.createElement("div");
      timerBadge.className = "task-timer";
      head.appendChild(timerBadge);
    }
    card.appendChild(head);

    var body = document.createElement("div");
    body.id = "task-body";
    card.appendChild(body);

    var result = state.results[idx];
    var answer = state.answers[idx];
    var currentInput = renderInput(task, body, answer, !!result);

    // Hint
    var hintBox = document.createElement("div");
    hintBox.id = "hint-box";
    card.appendChild(hintBox);
    if((state.hintsUsed[idx]||0) > 0 && task.hint){
      hintBox.innerHTML = '<div class="hint-box">💡 '+escapeHtml(task.hint)+'</div>';
    }

    // Feedback
    var fbEl = document.createElement("div");
    fbEl.id = "feedback";
    card.appendChild(fbEl);
    if(result){ drawFeedback(fbEl, result, state.hintsUsed[idx]||0); }

    // Actions
    var act = document.createElement("div");
    act.className = "actions";
    var left = document.createElement("div");
    var right = document.createElement("div");
    left.className = "row"; right.className = "row";

    if(!result && task.hint){
      var hintBtn = document.createElement("button");
      hintBtn.className = "btn btn-ghost";
      hintBtn.innerHTML = '💡 Показать подсказку (−2 балла)';
      hintBtn.addEventListener("click", function(){
        state.hintsUsed[idx] = (state.hintsUsed[idx]||0) + 1;
        saveState();
        renderTask();
      });
      left.appendChild(hintBtn);
    }
    if(!result){
      var check = document.createElement("button");
      check.className = "btn btn-primary";
      check.textContent = "Проверить";
      check.addEventListener("click", function(){
        var ans = currentInput.getAnswer();
        state.answers[idx] = ans;
        var r = evaluate(task, ans);
        state.results[idx] = r;
        saveState();
        clearTimer();
        drawFeedback(fbEl, r, state.hintsUsed[idx]||0);
        if(!r.ok){ card.classList.add("shake"); setTimeout(function(){ card.classList.remove("shake"); }, 400); }
        else { fireConfetti(80); }
        render();
      });
      right.appendChild(check);
    } else {
      var retry = document.createElement("button");
      retry.className = "btn btn-outline";
      retry.textContent = "Попробовать снова";
      retry.addEventListener("click", function(){
        state.results[idx] = null;
        state.answers[idx] = null;
        state.hintsUsed[idx] = 0;
        saveState();
        renderTask();
        render();
      });
      right.appendChild(retry);

      if(idx < TASKS.length - 1){
        var nextBtn = document.createElement("button");
        nextBtn.className = "btn btn-primary";
        nextBtn.textContent = "Далее →";
        nextBtn.addEventListener("click", function(){ go(idx+1); });
        right.appendChild(nextBtn);
      } else {
        var fbtn = document.createElement("button");
        fbtn.className = "btn btn-primary";
        fbtn.textContent = "К итогам →";
        fbtn.addEventListener("click", finish);
        right.appendChild(fbtn);
      }
    }
    act.appendChild(left); act.appendChild(right);
    card.appendChild(act);

    stage.innerHTML = "";
    stage.appendChild(card);

    if(!result && task.timeLimitSec && task.timeLimitSec > 0){
      var left2 = task.timeLimitSec;
      var startedAt = Date.now();
      function tick(){
        var elapsed = Math.floor((Date.now()-startedAt)/1000);
        var rem = task.timeLimitSec - elapsed;
        if(rem <= 0){
          clearTimer();
          timerBadge.textContent = "0:00";
          timerBadge.classList.add("urgent");
          // Auto-submit current answer
          var ans = currentInput.getAnswer();
          state.answers[idx] = ans;
          state.results[idx] = evaluate(task, ans);
          saveState();
          renderTask(); render();
          return;
        }
        var m = Math.floor(rem/60), s = rem%60;
        timerBadge.textContent = m+":"+(s<10?"0":"")+s;
        if(rem <= 5){ timerBadge.classList.add("urgent"); } else { timerBadge.classList.remove("urgent"); }
      }
      tick();
      timerHandle = setInterval(tick, 500);
    }
  }

  function drawFeedback(el, r, hints){
    var cls = r.ok ? "feedback ok" : "feedback err";
    var hintLine = hints > 0 ? " (−"+(2*hints)+" за подсказки)" : "";
    var effScore = Math.max(0, r.score - 2*hints);
    el.innerHTML = '<div class="'+cls+'"><div class="pts">'+effScore+' / '+r.maxScore+' '+plural(r.maxScore,"балл","балла","баллов")+'</div><div>'+escapeHtml(r.feedback)+hintLine+'</div></div>';
  }

  function plural(n, one, few, many){
    n = Math.abs(n)|0;
    if(n%10===1 && n%100!==11) return one;
    if(n%10>=2 && n%10<=4 && (n%100<10||n%100>=20)) return few;
    return many;
  }

  function escapeHtml(s){
    return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  // ---- Input renderers ----
  function renderInput(task, body, savedAnswer, disabled){
    switch(task.type){
      case "MCQ": return renderMcq(task, body, savedAnswer, disabled);
      case "TRUE_FALSE": return renderTrueFalse(task, body, savedAnswer, disabled);
      case "SHORT_ANSWER": return renderShortAnswer(task, body, savedAnswer, disabled);
      case "FILL_BLANK": return renderFillBlank(task, body, savedAnswer, disabled);
      case "MATCHING": return renderMatching(task, body, savedAnswer, disabled);
      case "ORDERING": return renderOrdering(task, body, savedAnswer, disabled);
      case "NUMERIC": return renderNumeric(task, body, savedAnswer, disabled);
    }
  }

  function renderMcq(task, body, saved, dis){
    var selected = saved && saved.selectedIndex!=null ? saved.selectedIndex : null;
    var options = task.options.map(function(o,i){ return {o:o,i:i}; });
    if(task.shuffle && !dis){ options.sort(function(){return Math.random()-.5;}); }
    var ul = document.createElement("ul");
    ul.className = "opt-list";
    options.forEach(function(pair){
      var li = document.createElement("li");
      li.className = "opt" + (selected===pair.i?" sel":"");
      li.innerHTML = '<input type="radio" name="mcq" '+(selected===pair.i?"checked":"")+' '+(dis?"disabled":"")+'> <span>'+escapeHtml(pair.o)+'</span>';
      if(!dis){
        li.addEventListener("click", function(){
          selected = pair.i;
          Array.prototype.forEach.call(ul.querySelectorAll(".opt"), function(e){ e.classList.remove("sel"); });
          li.classList.add("sel");
          var inp = li.querySelector("input"); if(inp) inp.checked = true;
        });
      }
      ul.appendChild(li);
    });
    body.appendChild(ul);
    return { getAnswer: function(){ return { type:"MCQ", selectedIndex: selected }; } };
  }

  function renderTrueFalse(task, body, saved, dis){
    var sel = saved ? saved.selected : null;
    var row = document.createElement("div");
    row.className = "tf";
    [["Верно",true],["Неверно",false]].forEach(function(pair){
      var b = document.createElement("div");
      b.className = "opt" + (sel===pair[1]?" sel":"");
      b.textContent = pair[0];
      if(!dis){
        b.addEventListener("click", function(){
          sel = pair[1];
          Array.prototype.forEach.call(row.children, function(e){ e.classList.remove("sel"); });
          b.classList.add("sel");
        });
      }
      row.appendChild(b);
    });
    body.appendChild(row);
    return { getAnswer: function(){ return { type:"TRUE_FALSE", selected: sel }; } };
  }

  function renderShortAnswer(task, body, saved, dis){
    var i = document.createElement("input");
    i.type = "text"; i.className = "input";
    i.value = saved && saved.text ? saved.text : "";
    i.disabled = !!dis;
    body.appendChild(i);
    return { getAnswer: function(){ return { type:"SHORT_ANSWER", text: i.value }; } };
  }

  function renderNumeric(task, body, saved, dis){
    var row = document.createElement("div");
    row.className = "row";
    var i = document.createElement("input");
    i.type = "number"; i.step = "any"; i.className = "input";
    i.value = saved && saved.value!=null ? saved.value : "";
    i.disabled = !!dis;
    row.appendChild(i);
    if(task.unit){
      var u = document.createElement("span");
      u.className = "muted"; u.textContent = task.unit;
      row.appendChild(u);
    }
    body.appendChild(row);
    return { getAnswer: function(){ var v = parseFloat(i.value); return { type:"NUMERIC", value: isNaN(v)?null:v }; } };
  }

  function renderFillBlank(task, body, saved, dis){
    var parts = (task.template||"").split(/___/);
    var wrap = document.createElement("div");
    wrap.className = "fill-template";
    var inputs = [];
    parts.forEach(function(part, i){
      wrap.appendChild(document.createTextNode(part));
      if(i < parts.length - 1){
        var inp = document.createElement("input");
        inp.type = "text";
        inp.disabled = !!dis;
        inp.value = (saved && saved.fillers && saved.fillers[i]) || "";
        wrap.appendChild(inp);
        inputs.push(inp);
      }
    });
    body.appendChild(wrap);
    return { getAnswer: function(){ return { type:"FILL_BLANK", fillers: inputs.map(function(x){return x.value;}) }; } };
  }

  function renderMatching(task, body, saved, dis){
    var pairs = (saved && saved.pairs) ? saved.pairs.slice() : [];
    var assigned = {};
    pairs.forEach(function(p){ assigned[p.rightIndex] = p.leftIndex; });
    var rightOrder = task.right.map(function(_,i){return i;}).sort(function(){return Math.random()-.5;});

    var wrap = document.createElement("div");
    wrap.className = "matching";
    var slotsEl = document.createElement("div");
    slotsEl.className = "slots";
    var trayEl = document.createElement("div");
    trayEl.className = "tray";
    trayEl.setAttribute("data-drop", "tray");

    task.left.forEach(function(leftItem, li){
      var slot = document.createElement("div");
      slot.className = "slot";
      slot.setAttribute("data-drop", "l-"+li);
      var lab = document.createElement("div");
      lab.className = "left-label";
      lab.textContent = leftItem;
      slot.appendChild(lab);
      slotsEl.appendChild(slot);
    });
    wrap.appendChild(slotsEl);
    wrap.appendChild(trayEl);

    function redraw(){
      // Clear chips
      Array.prototype.forEach.call(slotsEl.querySelectorAll(".chip"), function(c){ c.parentNode.removeChild(c); });
      trayEl.innerHTML = "";
      rightOrder.forEach(function(ri){
        var chip = document.createElement("div");
        chip.className = "chip";
        chip.textContent = task.right[ri];
        chip.draggable = !dis;
        chip.setAttribute("data-right", String(ri));
        chip.addEventListener("dragstart", function(e){
          if(dis){ e.preventDefault(); return; }
          chip.classList.add("dragging");
          e.dataTransfer.setData("text/plain", String(ri));
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("dragend", function(){ chip.classList.remove("dragging"); });
        // Touch support
        var touchGhost = null, touchOffX=0, touchOffY=0;
        chip.addEventListener("touchstart", function(e){
          if(dis) return;
          var t = e.touches[0];
          var rect = chip.getBoundingClientRect();
          touchOffX = t.clientX - rect.left; touchOffY = t.clientY - rect.top;
          touchGhost = chip.cloneNode(true);
          touchGhost.style.cssText = "position:fixed;pointer-events:none;z-index:200;left:"+(rect.left)+"px;top:"+(rect.top)+"px;width:"+(rect.width)+"px;opacity:.8";
          document.body.appendChild(touchGhost);
          chip.classList.add("dragging");
        }, {passive:true});
        chip.addEventListener("touchmove", function(e){
          if(!touchGhost) return;
          var t = e.touches[0];
          touchGhost.style.left = (t.clientX - touchOffX)+"px";
          touchGhost.style.top = (t.clientY - touchOffY)+"px";
          e.preventDefault();
        }, {passive:false});
        chip.addEventListener("touchend", function(e){
          if(!touchGhost) return;
          var t = (e.changedTouches && e.changedTouches[0]) || null;
          var dropTarget = null;
          if(t){
            touchGhost.style.display = "none";
            dropTarget = document.elementFromPoint(t.clientX, t.clientY);
            while(dropTarget && !dropTarget.getAttribute("data-drop")){ dropTarget = dropTarget.parentElement; }
          }
          if(touchGhost.parentNode) touchGhost.parentNode.removeChild(touchGhost);
          touchGhost = null;
          chip.classList.remove("dragging");
          if(dropTarget){
            var ds = dropTarget.getAttribute("data-drop");
            dropOn(ds, ri);
          }
        });

        if(assigned[ri] != null){
          var slot = slotsEl.children[assigned[ri]];
          slot.appendChild(chip);
        } else {
          trayEl.appendChild(chip);
        }
      });
      if(!trayEl.firstChild){
        var empty = document.createElement("div");
        empty.className = "muted"; empty.style.padding = "8px"; empty.style.fontSize="13px";
        empty.textContent = "Все перенесены";
        trayEl.appendChild(empty);
      }
    }

    function dropOn(dest, ri){
      // Remove ri from its current place
      delete assigned[ri];
      if(dest === "tray"){ /* go back to tray */ }
      else if(/^l-\\d+$/.test(dest)){
        var li2 = parseInt(dest.slice(2),10);
        // kick out anyone already on li2
        Object.keys(assigned).forEach(function(k){ if(assigned[k]===li2) delete assigned[k]; });
        assigned[ri] = li2;
      }
      redraw();
    }

    [slotsEl, trayEl].forEach(function(container){
      container.addEventListener("dragover", function(e){
        if(dis) return;
        e.preventDefault();
        var t = e.target;
        while(t && !t.getAttribute("data-drop")){ t = t.parentElement; }
        if(t) t.classList.add("over");
      });
      container.addEventListener("dragleave", function(e){
        var t = e.target;
        while(t && !t.getAttribute("data-drop")){ t = t.parentElement; }
        if(t) t.classList.remove("over");
      });
      container.addEventListener("drop", function(e){
        if(dis) return;
        e.preventDefault();
        var t = e.target;
        while(t && !t.getAttribute("data-drop")){ t = t.parentElement; }
        if(!t) return;
        t.classList.remove("over");
        var ri = parseInt(e.dataTransfer.getData("text/plain"),10);
        if(isNaN(ri)) return;
        dropOn(t.getAttribute("data-drop"), ri);
      });
    });

    body.appendChild(wrap);
    redraw();

    return { getAnswer: function(){
      var out = [];
      Object.keys(assigned).forEach(function(k){ out.push({ rightIndex: parseInt(k,10), leftIndex: assigned[k] }); });
      return { type:"MATCHING", pairs: out };
    } };
  }

  function renderOrdering(task, body, saved, dis){
    var order = (saved && saved.order) ? saved.order.slice() : task.items.map(function(_,i){return i;}).sort(function(){return Math.random()-.5;});
    var list = document.createElement("div");
    list.className = "ordering-list";
    function redraw(){
      list.innerHTML = "";
      order.forEach(function(itemIdx, pos){
        var row = document.createElement("div");
        row.className = "ord-item";
        row.draggable = !dis;
        row.dataset.pos = String(pos);
        row.innerHTML = '<span class="handle">⋮⋮</span><span>'+escapeHtml(task.items[itemIdx]||"")+'</span>';
        var ctrl = document.createElement("div");
        ctrl.className = "ord-controls";
        var up = document.createElement("button");
        up.textContent = "↑";
        up.disabled = pos===0 || dis;
        up.addEventListener("click", function(){ if(pos>0){ var t=order[pos-1]; order[pos-1]=order[pos]; order[pos]=t; redraw(); } });
        var down = document.createElement("button");
        down.textContent = "↓";
        down.disabled = pos===order.length-1 || dis;
        down.addEventListener("click", function(){ if(pos<order.length-1){ var t=order[pos+1]; order[pos+1]=order[pos]; order[pos]=t; redraw(); } });
        ctrl.appendChild(up); ctrl.appendChild(down);
        row.appendChild(ctrl);
        if(!dis){
          row.addEventListener("dragstart", function(e){
            row.classList.add("dragging");
            e.dataTransfer.setData("text/plain", String(pos));
          });
          row.addEventListener("dragend", function(){ row.classList.remove("dragging"); });
          row.addEventListener("dragover", function(e){ e.preventDefault(); });
          row.addEventListener("drop", function(e){
            e.preventDefault();
            var from = parseInt(e.dataTransfer.getData("text/plain"),10);
            var to = pos;
            if(isNaN(from) || from===to) return;
            var moved = order[from];
            order.splice(from,1);
            order.splice(to,0,moved);
            redraw();
          });
        }
        list.appendChild(row);
      });
    }
    redraw();
    body.appendChild(list);
    return { getAnswer: function(){ return { type:"ORDERING", order: order.slice() }; } };
  }

  // ---- Final screen ----
  function renderFinal(){
    var stage = document.getElementById("stage");
    var t = totalScore();
    var pct = t.max > 0 ? Math.round(t.score/t.max*100) : 0;
    var emoji, tier;
    if(pct >= 90){ emoji = "🏆"; tier = "Превосходно!"; }
    else if(pct >= 70){ emoji = "🎉"; tier = "Отличный результат"; }
    else if(pct >= 50){ emoji = "👍"; tier = "Хорошо, есть над чем поработать"; }
    else { emoji = "💪"; tier = "Попробуйте ещё раз"; }
    var correctCount = state.results.filter(function(r){ return r && r.ok; }).length;
    var html = '<div class="final">'
      + '<div class="emoji">'+emoji+'</div>'
      + '<div class="big">'+t.score+' / '+t.max+'</div>'
      + '<div class="tier">'+tier+' · '+pct+'%</div>'
      + '<div class="muted" style="margin-top:4px">Правильно: '+correctCount+' из '+TASKS.length+'</div>'
      + '<ul class="breakdown" style="list-style:none;padding:0">';
    TASKS.forEach(function(it, idx){
      var r = state.results[idx];
      var s = r ? (Math.max(0, r.score - 2*(state.hintsUsed[idx]||0)) + '/' + r.maxScore) : '—';
      html += '<li><span>'+(idx+1)+'. '+escapeHtml(it.task.question||"")+'</span><span class="sc">'+s+'</span></li>';
    });
    html += '</ul>'
      + '<div style="margin-top:24px"><button class="btn btn-outline" id="retry-all">Пройти снова</button> <button class="btn btn-primary" id="review">К первому заданию</button></div>'
      + '</div>';
    stage.innerHTML = html;
    document.getElementById("retry-all").addEventListener("click", resetState);
    document.getElementById("review").addEventListener("click", function(){ go(0); });
    if(pct >= 80){ fireConfetti(160); }
  }

  // Kickoff
  if(!TASKS || TASKS.length === 0){
    document.getElementById("stage").innerHTML = '<div class="muted" style="padding:40px;text-align:center">В этом КСП пока нет интерактивных заданий.</div>';
    document.getElementById("nav").innerHTML = "";
  } else {
    render();
  }
})();
`;

/** README for the zip, instructing the teacher how to open the package. */
export function buildReadme(plan: LessonPlanRow): string {
  return `КСП: ${plan.title}
Тема: ${plan.content.topic}
Класс: ${plan.grade}

Содержимое пакета:
- plan.docx           — краткосрочный план (открывается в Word / Google Docs)
- interactive.html    — интерактивные задания (откройте двойным кликом в любом браузере)
- README.txt          — этот файл

Инструкция для учителя:
1. Распакуйте архив полностью (не запускайте файлы из zip напрямую).
2. Откройте interactive.html — файл работает без интернета, в любом современном браузере.
3. Для проведения урока выведите интерактивные задания на проектор / интерактивную доску.
4. Прогресс сохраняется в браузере; кнопка «Сбросить прогресс» очищает ответы.

Типы поддерживаемых заданий: выбор ответа, верно/неверно, короткий ответ,
заполни пропуск, соотнесение (drag-and-drop), порядок, числовой ответ.
`;
}
