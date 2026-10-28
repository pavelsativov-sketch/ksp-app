import pathlib
p = pathlib.Path(r"C:/Users/PC/Desktop/ksp-app-devin-1776938365-ksp-app-mvp/src/components/ksp/task-builder.tsx")
s = p.read_text(encoding="utf-8")

replacements = []

# 1 imports
old = """import {
  emptyTask,
  taskTypeLabel,
  type InteractiveTask,
  type TaskType,
  type McqTask,
  type TrueFalseTask,
  type ShortAnswerTask,
  type FillBlankTask,
  type MatchingTask,
  type OrderingTask,
  type NumericTask,
} from "@/lib/ksp/tasks";"""
new = """import {
  emptyTask,
  taskTypeLabel,
  differentiationLevelLabel,
  differentiationLevelBadgeClass,
  type DifferentiationLevel,
  type InteractiveTask,
  type TaskType,
  type McqTask,
  type TrueFalseTask,
  type ShortAnswerTask,
  type FillBlankTask,
  type MatchingTask,
  type OrderingTask,
  type NumericTask,
} from "@/lib/ksp/tasks";"""
if old in s:
    s = s.replace(old, new)
    print("1 imports ok")
else:
    print("1 imports NOT found")

# 2 LEVELS
if "const LEVELS" not in s:
    s = s.replace(
        'const VARIATION_LABELS: Record<TaskVariationStyle, { ru: string; kk: string }> = {',
        'const LEVELS: DifferentiationLevel[] = ["A","B","C"];\n\nconst VARIATION_LABELS: Record<TaskVariationStyle, { ru: string; kk: string }> = {'
    )
    print("2 LEVELS ok")

# 3 requestTaskVariants
s = s.replace(
    'async function requestTaskVariants(context: TaskGenerationContext, baseTask?: InteractiveTask, variationStyle?: TaskVariationStyle) {',
    'async function requestTaskVariants(context: TaskGenerationContext, baseTask?: InteractiveTask, variationStyle?: TaskVariationStyle, differentiationLevel?: DifferentiationLevel) {'
)
print("3 sig ok")

if '...(differentiationLevel ? { differentiationLevel } : {})' not in s:
    s = s.replace(
        '    body: JSON.stringify({ ...context, count: 3, ...(cleanBaseTask ? { baseTask: cleanBaseTask } : {}), ...(variationStyle ? { variationStyle } : {}) }),',
        '    body: JSON.stringify({ ...context, count: 3, ...(cleanBaseTask ? { baseTask: cleanBaseTask } : {}), ...(variationStyle ? { variationStyle } : {}), ...(differentiationLevel ? { differentiationLevel } : {}) }),'
    )
    print("3 body ok")

# 4 bulkLevel state - first TaskBuilder alternatives line
if 'const [bulkLevel' not in s:
    s = s.replace(
        '  const [alternatives, setAlternatives] = useState<InteractiveTask[]>([]);\n  const { locale } = useUiLocale();\n  const isKk = locale === "kk";\n\n  function addTask() {',
        '  const [alternatives, setAlternatives] = useState<InteractiveTask[]>([]);\n  const [bulkLevel, setBulkLevel] = useState<DifferentiationLevel | "">("");\n  const { locale } = useUiLocale();\n  const isKk = locale === "kk";\n\n  function addTask() {',
        1
    )
    print("4 bulkLevel state ok")

# 4b generateTasks bulkLevel - first occurrence
if 'requestTaskVariants(context, undefined, undefined, bulkLevel' not in s:
    s = s.replace(
        '    try {\n      setAlternatives(await requestTaskVariants(context));\n    } catch (e) {',
        '    try {\n      setAlternatives(await requestTaskVariants(context, undefined, undefined, bulkLevel || undefined));\n    } catch (e) {',
        1
    )
    print("4b bulkLevel gen ok")

# 4c selector
if 'value={bulkLevel}' not in s:
    s = s.replace(
        '          <Button type="button" variant="outline" size="sm" onClick={addTask}>',
        '          <select\n            value={bulkLevel}\n            onChange={(e) => setBulkLevel(e.target.value as DifferentiationLevel | "")}\n            className="h-9 rounded-md border border-input bg-white px-2 text-xs"\n            title={isKk ? "Дифференциация деңгейі" : "Уровень дифференциации"}\n            aria-label={isKk ? "AI генерация деңгейі" : "Уровень для AI-генерации"}\n          >\n            <option value="">{isKk ? "Деңгей — кез келген" : "Уровень — любой"}</option>\n            {LEVELS.map((lv) => (\n              <option key={lv} value={lv}>{differentiationLevelLabel(lv as DifferentiationLevel, isKk ? "kk" : "ru")}</option>\n            ))}\n          </select>\n          <Button type="button" variant="outline" size="sm" onClick={addTask}>',
        1
    )
    print("4c selector ok")

# 5 genLevel
if 'const [genLevel' not in s:
    s = s.replace(
        '  const [variationStyle, setVariationStyle] = useState<TaskVariationStyle>("alternate");\n  const { locale } = useUiLocale();\n  const isKk = locale === "kk";\n\n  async function generateAlternatives() {',
        '  const [variationStyle, setVariationStyle] = useState<TaskVariationStyle>("alternate");\n  const [genLevel, setGenLevel] = useState<DifferentiationLevel | "">("");\n  const { locale } = useUiLocale();\n  const isKk = locale === "kk";\n\n  async function generateAlternatives() {',
        1
    )
    print("5 genLevel ok")

if 'requestTaskVariants(context, task, variationStyle, genLevel' not in s:
    s = s.replace(
        '      setVariants(await requestTaskVariants(context, task, variationStyle));',
        '      setVariants(await requestTaskVariants(context, task, variationStyle, genLevel || undefined));',
        1
    )
    print("5b genLevel call ok")

if 'id={`gen-level-' not in s:
    s = s.replace(
        '          <Button type="button" variant="outline" size="sm" onClick={generateAlternatives} disabled={variantLoading} aria-busy={variantLoading}>',
        '          <label className="sr-only" htmlFor={`gen-level-${task.id}`}>{isKk ? "Деңгей" : "Уровень"}</label>\n          <select\n            id={`gen-level-${task.id}`}\n            value={genLevel}\n            onChange={(e) => setGenLevel(e.target.value as DifferentiationLevel | "")}\n            className="max-w-28 rounded-lg border border-[#cfc3b5] bg-white px-2 py-1.5 text-xs"\n            title={isKk ? "Генерация деңгейі" : "Уровень генерации"}\n          >\n            <option value="">{isKk ? "Деңгей — ағымдағы" : "Уровень — как у задания"}</option>\n            {LEVELS.map((lv) => (\n              <option key={lv} value={lv}>{differentiationLevelLabel(lv as DifferentiationLevel, isKk ? "kk" : "ru")}</option>\n            ))}\n          </select>\n          <Button type="button" variant="outline" size="sm" onClick={generateAlternatives} disabled={variantLoading} aria-busy={variantLoading}>',
        1
    )
    print("5c genLevel selector ok")

# 6 badge header
if s.count('differentiationLevelBadgeClass(task.differentiationLevel)') <= 1:
    s = s.replace(
        '          <span className="text-xs uppercase tracking-wider text-[#8a817a]">\n            {taskTypeLabel(task.type)}\n          </span>',
        '          <span className="text-xs uppercase tracking-wider text-[#8a817a]">\n            {taskTypeLabel(task.type)}\n          </span>\n          {task.differentiationLevel && (\n            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${differentiationLevelBadgeClass(task.differentiationLevel)}`}>\n              {task.differentiationLevel}\n            </span>\n          )}',
        1
    )
    print("6 badge ok")

# 7 CommonFields grid
if 'const levelId' not in s:
    s = s.replace(
        '  const questionId = `task-question-${task.id}`;\n  const pointsId = `task-points-${task.id}`;\n  return (\n    <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">',
        '  const questionId = `task-question-${task.id}`;\n  const pointsId = `task-points-${task.id}`;\n  const levelId = `task-level-${task.id}`;\n  return (\n    <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_160px] gap-3">'
    )
    print("7 grid ok")
    s = s.replace(
        '      <div>\n        <Label htmlFor={pointsId}>Баллов</Label>\n        <Input\n          id={pointsId}\n          type="number"\n          min={1}\n          max={100}\n          value={task.points}\n          onChange={(e) => onChange({ ...task, points: Math.max(1, Number(e.target.value) || 1) })}\n        />\n      </div>\n    </div>\n  );\n}\n\nfunction TaskOptions',
        '      <div>\n        <Label htmlFor={pointsId}>Баллов</Label>\n        <Input\n          id={pointsId}\n          type="number"\n          min={1}\n          max={100}\n          value={task.points}\n          onChange={(e) => onChange({ ...task, points: Math.max(1, Number(e.target.value) || 1) })}\n        />\n      </div>\n      <div>\n        <Label htmlFor={levelId}>Дифференциация</Label>\n        <select\n          id={levelId}\n          value={task.differentiationLevel ?? ""}\n          onChange={(e) => {\n            const v = e.target.value as DifferentiationLevel | "";\n            onChange({ ...task, differentiationLevel: v || undefined });\n          }}\n          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"\n        >\n          <option value="">— без уровня —</option>\n          {(["A","B","C"] as DifferentiationLevel[]).map((lv) => (\n            <option key={lv} value={lv}>{differentiationLevelLabel(lv, "ru")} </option>\n          ))}\n        </select>\n      </div>\n    </div>\n  );\n}\n\nfunction TaskOptions'
    )
    print("7 selector ok")

# 8 candidate badge
if 'rounded-full border px-1.5 py-0.5 text-[10px]' not in s:
    s = s.replace(
        '        <span className="text-xs text-[#756b63]">{taskTypeLabel(task.type)} · {task.points} {isKk ? "ұпай" : "балл"}</span>',
        '        <span className="flex items-center gap-1 text-xs text-[#756b63]">{taskTypeLabel(task.type)} · {task.points} {isKk ? "ұпай" : "балл"}{task.differentiationLevel && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${differentiationLevelBadgeClass(task.differentiationLevel)}`}>{task.differentiationLevel}</span>}</span>'
    )
    print("8 candidate ok")

p.write_text(s, encoding="utf-8")
print("done")
