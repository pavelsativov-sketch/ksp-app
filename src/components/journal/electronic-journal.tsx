"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AttendanceStatus,
  JournalEntryView,
  JournalState,
  JournalStudentView,
} from "@/lib/journal";

const COPY = {
  ru: {
    title: "Электронный журнал класса",
    subtitle:
      "База учеников создаётся автоматически по ФИО выполненных ДЗ или вручную. Шкала ФО: от 1 до 10 баллов; посещаемость: УП (уважительная), НП (неуважительная), Б (по болезни).",
    classFilter: "Класс",
    allClasses: "Все классы",
    subjectLabel: "Предмет",
    newSubjectPlaceholder: "Введите предмет (напр. Математика)",
    addDate: "Добавить дату",
    addStudents: "Добавить учеников",
    importHw: "Перенести баллы из ДЗ",
    syncHw: "Синхронизировать ФИО из ДЗ",
    exportCsv: "CSV",
    exportDocx: "Word (.docx)",
    colStudent: "ФИО ученика",
    colClass: "Класс",
    colAvg: "Ср. (10)",
    colQuality: "Качество",
    colAbsences: "Пропуски (УП / НП / Б)",
    emptyTitle: "В электронном журнале пока нет учеников",
    emptyHint:
      "Как только ученики выполнят выданное домашнее задание по ссылке /a/[код], их ФИО появятся здесь автоматически — либо добавьте список класса вручную.",
    modalAddTitle: "Добавить учеников в базу и журнал",
    modalClassLabel: "Класс (например: 5А, 8Б, 10 класс)",
    modalNamesLabel: "ФИО учеников (по одному в строке — можно вставить список из Excel или Word)",
    modalNamesPlaceholder: "Алиев Санжар\nАхметова Айгерим\nСериков Данияр",
    saveStudents: "Сохранить список",
    cancel: "Отмена",
    importModalTitle: "Импорт результатов выполненного ДЗ в журнал (1–10 баллов)",
    selectAssignment: "Выберите выданное ДЗ",
    importTargetDate: "На какую дату урока выставить баллы",
    runImport: "Перенести в журнал",
    cellScoreLabel: "Балл ФО (максимум 10):",
    cellAttendanceLabel: "Отметка отсутствия:",
    excused: "УП — Уважительная",
    unexcused: "НП — Неуважительная",
    sick: "Б — По болезни",
    clearCell: "Очистить ячейку",
    sourceHw: "из ДЗ",
    sourceManual: "вручную",
    sourceSchool: "школа",
    removeStudentTitle: "Удалить ученика из журнала",
    codeMap: { excused: "УП", unexcused: "НП", sick: "Б" } as Record<AttendanceStatus, string>,
  },
  kk: {
    title: "Сыныптың электрондық журналы",
    subtitle:
      "Оқушылар базасы орындалған үй тапсырмаларындағы АТЖ бойынша автоматты түрде немесе қолмен құрылады. ҚБ шкаласы: 1–10 балл; қатысуы: ДС (дәлелді), ДЖ (дәлелсіз), А (ауруына байланысты).",
    classFilter: "Сынып",
    allClasses: "Барлық сыныптар",
    subjectLabel: "Пән",
    newSubjectPlaceholder: "Пән атауын жазыңыз (мыс. Математика)",
    addDate: "Күн қосу",
    addStudents: "Оқушы қосу",
    importHw: "ҮТ баллдарын енгізу",
    syncHw: "ҮТ-дан АТЖ жаңарту",
    exportCsv: "CSV",
    exportDocx: "Word (.docx)",
    colStudent: "Оқушының аты-жөні",
    colClass: "Сынып",
    colAvg: "Орт. (10)",
    colQuality: "Сапа",
    colAbsences: "Босатулар (ДС / ДЖ / А)",
    emptyTitle: "Электрондық журналда әзірше оқушылар жоқ",
    emptyHint:
      "Оқушылар /a/[код] сілтемесі арқылы үй тапсырмасын орындаған сәтте олардың аты-жөні осында автоматты түрде түседі, не сынып тізімін қолмен қосыңыз.",
    modalAddTitle: "Базаға және журналға оқушыларды қосу",
    modalClassLabel: "Сынып (мысалы: 5А, 8Ә, 10 сынып)",
    modalNamesLabel: "Оқушылардың аты-жөні (әр жолға біреуден — Excel/Word тізімін қоюға болады)",
    modalNamesPlaceholder: "Әлиев Санжар\nАхметова Айгерім\nСеріков Данияр",
    saveStudents: "Тізімді сақтау",
    cancel: "Болдырмау",
    importModalTitle: "Орындалған ҮТ нәтижелерін 10 балдық шкаламен журналға енгізу",
    selectAssignment: "Үй тапсырмасын таңдаңыз",
    importTargetDate: "Сабақ күні",
    runImport: "Журналға енгізу",
    cellScoreLabel: "ҚБ балы (ең көбі 10):",
    cellAttendanceLabel: "Қатыспау белгісі:",
    excused: "ДС — Дәлелді себеп",
    unexcused: "ДЖ — Дәлелсіз себеп",
    sick: "А — Ауруына байланысты",
    clearCell: "Ұяшықты тазарту",
    sourceHw: "ҮТ-дан",
    sourceManual: "қолмен",
    sourceSchool: "мектеп",
    removeStudentTitle: "Оқушыны журналдан өшіру",
    codeMap: { excused: "ДС", unexcused: "ДЖ", sick: "А" } as Record<AttendanceStatus, string>,
  },
} as const;

export function ElectronicJournal({
  initialState,
  locale = "ru",
}: {
  initialState: JournalState;
  locale?: "ru" | "kk";
}) {
  const L = COPY[locale];
  const [state, setState] = useState<JournalState>(initialState);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>(
    initialState.subjects[0] ?? "Общий предмет",
  );
  const [customSubject, setCustomSubject] = useState(false);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Ячейка, открытая для выставления балла / посещаемости
  const [activeCell, setActiveCell] = useState<{ studentId: string; date: string } | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  // Панель добавления учеников
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClassInput, setNewClassInput] = useState("5А");
  const [newNamesInput, setNewNamesInput] = useState("");

  // Панель импорта результатов ДЗ
  const [showImportModal, setShowImportModal] = useState(false);
  const [importAssignmentId, setImportAssignmentId] = useState(
    initialState.assignments[0]?.id ?? "",
  );
  const [importDateOverride, setImportDate] = useState<string | null>(null);
  const [newDateOverride, setNewDateInput] = useState<string | null>(null);

  // Гидрационно-безопасная клиентская дата без синхронного setState в useEffect
  const clientToday = useSyncExternalStore(
    () => () => {},
    () => new Date().toISOString().slice(0, 10),
    () => "",
  );
  const newDateInput = newDateOverride ?? clientToday;
  const importDate = importDateOverride ?? clientToday;

  const reload = useCallback(
    async (opts?: { className?: string; subject?: string; sync?: boolean }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const cls = opts?.className ?? selectedClass;
        const subj = opts?.subject ?? selectedSubject;
        if (cls) params.set("className", cls);
        if (subj) params.set("subject", subj);
        if (opts?.sync === false) params.set("sync", "0");
        const res = await fetch(`/api/journal?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as JournalState;
        setState(next);
      } finally {
        setLoading(false);
      }
    },
    [selectedClass, selectedSubject],
  );

  // Все отображаемые даты (из записей + сегодняшняя дата при пустом журнале + добавленные учителем)
  const visibleDates = useMemo(() => {
    const fallback = state.dates.length === 0 && clientToday ? [clientToday] : [];
    const set = new Set<string>([...state.dates, ...fallback, ...extraDates]);
    return Array.from(set).sort();
  }, [state.dates, extraDates, clientToday]);

  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntryView>();
    for (const e of state.entries) {
      if (!selectedSubject || e.subject === selectedSubject) {
        map.set(`${e.studentId}:${e.date}`, e);
      }
    }
    return map;
  }, [state.entries, selectedSubject]);

  const visibleStudents = useMemo(() => {
    if (!selectedClass) return state.students;
    return state.students.filter((s) => s.className === selectedClass);
  }, [state.students, selectedClass]);

  async function handleCellAction(
    studentId: string,
    date: string,
    patch: { score: number | null; attendance: AttendanceStatus | null },
  ) {
    const cellKey = `${studentId}:${date}`;
    setSavingCell(cellKey);
    setActiveCell(null);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-cell",
          studentId,
          subject: selectedSubject || "Общий предмет",
          date,
          score: patch.score,
          attendance: patch.attendance,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Ошибка сохранения");
      }
      await reload({ sync: false });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось сохранить отметку");
    } finally {
      setSavingCell(null);
    }
  }

  async function handleAddStudents() {
    const names = newNamesInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (!newClassInput.trim() || names.length === 0) return;

    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-students",
          className: newClassInput.trim(),
          names,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Ошибка добавления учеников");
      setNewNamesInput("");
      setShowAddModal(false);
      setSelectedClass(newClassInput.trim());
      await reload({ className: newClassInput.trim(), sync: false });
      setNotice(
        locale === "kk"
          ? `Қосылған жаңа оқушылар: ${data.added ?? 0}`
          : `Добавлено новых учеников в журнал: ${data.added ?? 0}`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка добавления");
      setLoading(false);
    }
  }

  async function handleSyncRoster() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-roster" }),
      });
      const data = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Ошибка синхронизации");
      await reload({ sync: false });
      setNotice(
        locale === "kk"
          ? `Орындалған ҮТ бойынша жаңа оқушылар қосылды: ${data.added ?? 0}`
          : `Синхронизация завершена. Новых учеников из выполненных ДЗ: ${data.added ?? 0}`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка синхронизации");
      setLoading(false);
    }
  }

  async function handleImportHomework() {
    if (!importAssignmentId) return;
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import-assignment",
          assignmentId: importAssignmentId,
          className: selectedClass || undefined,
          subject: selectedSubject || undefined,
          date: importDate || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        imported?: number;
        subject?: string;
        date?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Не удалось перенести результаты ДЗ");
      setShowImportModal(false);
      if (data.subject) setSelectedSubject(data.subject);
      if (data.date && !extraDates.includes(data.date)) {
        setExtraDates((prev) => [...prev, data.date!]);
      }
      await reload({ subject: data.subject ?? selectedSubject, sync: false });
      setNotice(
        locale === "kk"
          ? `Журналға 10 балдық шкаламен ${data.imported ?? 0} баға енгізілді (${data.date})`
          : `В журнал выставлено оценок (по 10-балльной шкале): ${data.imported ?? 0}`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка импорта");
      setLoading(false);
    }
  }

  async function handleDeleteStudent(student: JournalStudentView) {
    setLoading(true);
    try {
      await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      await reload({ sync: false });
    } finally {
      setLoading(false);
    }
  }

  const exportParams = new URLSearchParams();
  if (selectedClass) exportParams.set("className", selectedClass);
  if (selectedSubject) exportParams.set("subject", selectedSubject);
  if (locale === "kk") exportParams.set("lang", "kz");

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="editorial-display text-2xl">{L.title}</CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs leading-relaxed">
              {L.subtitle}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setShowAddModal((v) => !v)}>
              <UserPlus className="size-4" /> {L.addStudents}
            </Button>
            {state.assignments.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowImportModal((v) => !v)}
              >
                <UploadCloud className="size-4" /> {L.importHw}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleSyncRoster()}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {L.syncHw}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/journal/export?format=csv&${exportParams.toString()}`}>
                <Download className="size-4" /> {L.exportCsv}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/journal/export?format=docx&${exportParams.toString()}`}>
                <FileSpreadsheet className="size-4" /> {L.exportDocx}
              </a>
            </Button>
          </div>
        </div>

        {/* Фильтры: Класс + Предмет + Добавление даты */}
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground">
              {L.classFilter}
            </label>
            <select
              value={selectedClass}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedClass(next);
                void reload({ className: next, sync: false });
              }}
              className="mt-1 h-9 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">{L.allClasses}</option>
              {state.classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">
              {L.subjectLabel}
            </label>
            {!customSubject ? (
              <div className="mt-1 flex items-center gap-1.5">
                <select
                  value={selectedSubject}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedSubject(next);
                    void reload({ subject: next, sync: false });
                  }}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {state.subjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomSubject(true)}
                  title="Добавить новый предмет"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  placeholder={L.newSubjectPlaceholder}
                  className="h-9 w-52 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setCustomSubject(false);
                    void reload({ subject: selectedSubject, sync: false });
                  }}
                >
                  OK
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-end gap-1.5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">
                {L.addDate}
              </label>
              <input
                type="date"
                value={newDateInput}
                onChange={(e) => setNewDateInput(e.target.value)}
                className="mt-1 h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(newDateInput) && !visibleDates.includes(newDateInput)) {
                  setExtraDates((prev) => [...prev, newDateInput]);
                }
              }}
            >
              <CalendarPlus className="size-4" />
            </Button>
          </div>
        </div>

        {notice && (
          <p className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
            {notice}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {/* Модальная панель ручного ввода учеников */}
        {showAddModal && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{L.modalAddTitle}</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddModal(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{L.modalClassLabel}</label>
                <Input
                  value={newClassInput}
                  onChange={(e) => setNewClassInput(e.target.value)}
                  placeholder="5А"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{L.modalNamesLabel}</label>
                <Textarea
                  rows={4}
                  value={newNamesInput}
                  onChange={(e) => setNewNamesInput(e.target.value)}
                  placeholder={L.modalNamesPlaceholder}
                  className="mt-1 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                {L.cancel}
              </Button>
              <Button type="button" size="sm" onClick={() => void handleAddStudents()} disabled={loading}>
                {L.saveStudents}
              </Button>
            </div>
          </div>
        )}

        {/* Модальная панель переноса оценок из ДЗ */}
        {showImportModal && state.assignments.length > 0 && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{L.importModalTitle}</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowImportModal(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{L.selectAssignment}</label>
                <select
                  value={importAssignmentId}
                  onChange={(e) => {
                    setImportAssignmentId(e.target.value);
                    const found = state.assignments.find((a) => a.id === e.target.value);
                    if (found?.latestDate) setImportDate(found.latestDate);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {state.assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.className} · {a.subject} · ответов: {a.attemptsCount})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{L.importTargetDate}</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowImportModal(false)}>
                {L.cancel}
              </Button>
              <Button type="button" size="sm" onClick={() => void handleImportHomework()} disabled={loading}>
                {L.runImport}
              </Button>
            </div>
          </div>
        )}

        {visibleStudents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <p className="font-semibold">{L.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">{L.emptyHint}</p>
            <div className="mt-4">
              <Button type="button" size="sm" onClick={() => setShowAddModal(true)}>
                <UserPlus className="size-4" /> {L.addStudents}
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs">
                  <th className="w-10 p-2.5 text-center">#</th>
                  <th className="min-w-[200px] p-2.5">{L.colStudent}</th>
                  <th className="w-24 p-2.5">{L.colClass}</th>
                  {visibleDates.map((d) => (
                    <th key={d} className="min-w-[64px] border-x border-border/60 p-2 text-center tabular-nums">
                      {d.slice(8, 10)}.{d.slice(5, 7)}
                    </th>
                  ))}
                  <th className="w-20 p-2.5 text-center">{L.colAvg}</th>
                  <th className="w-20 p-2.5 text-center">{L.colQuality}</th>
                  <th className="w-36 p-2.5 text-center">{L.colAbsences}</th>
                  <th className="w-10 p-2 text-center" aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((st, idx) => (
                  <tr
                    key={st.id}
                    className="border-b border-border last:border-0 hover:bg-muted/25"
                  >
                    <td className="p-2.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="p-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/gradebook/${encodeURIComponent(st.fullName)}`}
                          className="hover:text-primary hover:underline"
                        >
                          {st.fullName}
                        </Link>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {st.source === "homework"
                            ? L.sourceHw
                            : st.source === "school"
                              ? L.sourceSchool
                              : L.sourceManual}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">{st.className}</td>

                    {visibleDates.map((date) => {
                      const key = `${st.id}:${date}`;
                      const entry = entryMap.get(key);
                      const isEditing =
                        activeCell?.studentId === st.id && activeCell?.date === date;
                      const isSaving = savingCell === key;

                      let badgeClass = "text-muted-foreground/40 hover:bg-primary/10";
                      let text = "·";
                      if (entry?.score !== null && entry?.score !== undefined) {
                        text = String(entry.score);
                        badgeClass =
                          entry.score >= 8
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold"
                            : entry.score >= 5
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold";
                      } else if (entry?.attendance) {
                        text = L.codeMap[entry.attendance];
                        badgeClass =
                          entry.attendance === "excused"
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold"
                            : entry.attendance === "sick"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                              : "bg-red-500/20 text-red-700 dark:text-red-300 font-semibold";
                      }

                      return (
                        <td
                          key={date}
                          className="relative border-x border-border/50 p-1 text-center"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCell(isEditing ? null : { studentId: st.id, date })
                            }
                            title={entry?.note || `${st.fullName} — ${date}`}
                            className={`mx-auto flex h-8 w-11 items-center justify-center rounded-lg text-xs transition-colors ${badgeClass}`}
                          >
                            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : text}
                          </button>

                          {isEditing && (
                            <div className="absolute left-1/2 top-10 z-30 w-64 -translate-x-1/2 rounded-xl border border-border bg-surface p-3 text-left shadow-xl">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  {L.cellScoreLabel}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveCell(null)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                              <div className="grid grid-cols-5 gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() =>
                                      void handleCellAction(st.id, date, {
                                        score: num,
                                        attendance: null,
                                      })
                                    }
                                    className={`h-8 rounded-md border text-xs font-bold transition-colors ${
                                      entry?.score === num
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-background hover:bg-muted"
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>

                              <p className="mb-1 mt-2.5 text-[11px] font-semibold text-muted-foreground">
                                {L.cellAttendanceLabel}
                              </p>
                              <div className="grid gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCellAction(st.id, date, {
                                      score: null,
                                      attendance: "excused",
                                    })
                                  }
                                  className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-left text-xs font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                                >
                                  {L.excused}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCellAction(st.id, date, {
                                      score: null,
                                      attendance: "unexcused",
                                    })
                                  }
                                  className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-left text-xs font-medium text-red-700 hover:bg-red-500/20 dark:text-red-300"
                                >
                                  {L.unexcused}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCellAction(st.id, date, {
                                      score: null,
                                      attendance: "sick",
                                    })
                                  }
                                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-left text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                                >
                                  {L.sick}
                                </button>
                              </div>

                              {(entry?.score || entry?.attendance) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCellAction(st.id, date, {
                                      score: null,
                                      attendance: null,
                                    })
                                  }
                                  className="mt-2 w-full rounded-md border border-border py-1 text-center text-[11px] text-muted-foreground hover:bg-muted"
                                >
                                  {L.clearCell}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    <td className="p-2.5 text-center font-bold tabular-nums">
                      {st.averageScore !== null ? st.averageScore : "—"}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-xs">
                      {st.qualityPercent !== null ? `${st.qualityPercent}%` : "—"}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-xs text-muted-foreground">
                      <span title={L.excused} className="text-sky-600 dark:text-sky-400">
                        {st.excusedCount}
                      </span>
                      {" / "}
                      <span title={L.unexcused} className="text-red-600 dark:text-red-400">
                        {st.unexcusedCount}
                      </span>
                      {" / "}
                      <span title={L.sick} className="text-amber-600 dark:text-amber-400">
                        {st.sickCount}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => void handleDeleteStudent(st)}
                        title={L.removeStudentTitle}
                        className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
