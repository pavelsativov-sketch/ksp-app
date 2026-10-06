import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { checkKspQuality, type QualityStatus } from "@/lib/ksp/quality";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

const icon: Record<QualityStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const color: Record<QualityStatus, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
};

/**
 * Гейт качества КСП: готовность к уроку и проверке.
 * Показывается владельцу на странице плана (не печатается).
 */
const kkCopy: Record<string, { label: string; hint: string; where?: string }> = {
  objectives: { label: "Оқу мақсаттары", hint: "Бағдарламадағы оқу мақсаттарын таңдаңыз.", where: "«Мақсаттар» бөлімі" },
  "lesson-objectives": { label: "Сабақ мақсаттары", hint: "3–5 нақты әрі өлшенетін мақсат қажет.", where: "«Мақсаттар» бөлімі" },
  criteria: { label: "Бағалау критерийлері", hint: "Әр критерий оқушының бақыланатын әрекетін сипаттауы керек.", where: "«Мақсаттар» бөлімі" },
  "stage-beginning": { label: "Сабақтың басы: сценарий", hint: "Мұғалім сөзі, оқушы әрекеті және ресурстарды толтырыңыз." },
  "stage-middle": { label: "Сабақтың ортасы: сценарий", hint: "Мұғалім сөзі, оқушы әрекеті және ресурстарды толтырыңыз." },
  "stage-end": { label: "Сабақтың соңы: сценарий", hint: "Мұғалім сөзі, оқушы әрекеті және ресурстарды толтырыңыз." },
  "stage-beginning-questions": { label: "Басы: сұрақтар мен дескрипторлар", hint: "Сұрақтар мен өлшенетін дескрипторларды қосыңыз." },
  "stage-middle-questions": { label: "Ортасы: сұрақтар мен дескрипторлар", hint: "Сұрақтар мен өлшенетін дескрипторларды қосыңыз." },
  "stage-end-questions": { label: "Соңы: сұрақтар мен дескрипторлар", hint: "Сұрақтар мен өлшенетін дескрипторларды қосыңыз." },
  points: { label: "Бағалау шкаласы — 10 балл", hint: "Практикалық тапсырмаларға бөлінген балл қосындысы 10 болуы тиіс.", where: "«Сабақ барысы» → тапсырмалар" },
  time: { label: "Сабақ ұзақтығы — 45 минут", hint: "Үш кезеңнің уақыт аралығын толтырыңыз.", where: "«Сабақ барысы» бөлімі" },
  homework: { label: "Үй тапсырмасы", hint: "Үй тапсырмасына қысқаша нұсқау мен түсініктеме жазыңыз.", where: "«Сабақ барысы» → соңы" },
  reflection: { label: "Оқушы рефлексиясы", hint: "Оқушы не үйренгенін және қай тұста қиналғанын сұраңыз.", where: "«Сабақ барысы» → соңы" },
  evaluation: { label: "Бағалау, саралау және қауіпсіздік", hint: "Қалыптастырушы бағалау, саралау, қауіпсіздік және мұғалім рефлексиясын толтырыңыз.", where: "«Бағалау» бөлімі" },
  values: { label: "Құндылықтар мен пәнаралық байланыс", hint: "Құндылықтарды сабақ әрекетімен байланыстырып, пәнаралық байланысты нақтылаңыз.", where: "«Контекст» бөлімі" },
  "task-objectives": { label: "Тапсырмалардың оқу мақсаттарымен байланысы", hint: "Әр тапсырманы нақты оқу мақсатымен байланыстырыңыз.", where: "«Сабақ барысы» → тапсырмалар" },
  "content-specificity": { label: "Нақтылық және пәндік мазмұн", hint: "Жалпы сөздерді нақты терминдермен, мысалдармен және тексерілетін әрекеттермен алмастырыңыз.", where: "Мақсаттар мен сабақ барысын тексеріңіз" },
  "content-language": { label: "Қазақ тілінің бірізділігі", hint: "Жоспарда орысша қалған нұсқауларды қазақшаға аударыңыз.", where: "Барлық бөлімді тексеріңіз" },
};

export function QualityGate({ content, planId, language = "ru" }: { content: Parameters<typeof checkKspQuality>[0]; planId: string; language?: "ru" | "kz" }) {
  const { locale } = useUiLocale();
  const { items, score } = checkKspQuality(content, language);
  const fails = items.filter((i) => i.status === "fail").length;
  const isKk = locale === "kk";
  return (
    <section aria-labelledby="quality-title" className="no-print space-y-4 rounded-xl border border-[#ddd5cb] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="quality-title" className="text-xl font-semibold">{isKk ? `Сабаққа дайындық: ${score}%` : `Готовность к уроку: ${score}%`}</h2>
          <p className="text-sm text-slate-600">
            {fails === 0
              ? (isKk ? "Жоспар сабақ өткізуге және басып шығаруға дайын." : "План можно проводить и печатать.")
              : isKk ? `Маңызды мәселе: ${fails}. Басып шығармай тұрып қызыл тармақтарды түзетіңіз.` : `Критично: ${fails}. Исправьте красные пункты перед печатью.`}
          </p>
        </div>
        <div className="h-2.5 w-44 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item) => {
          const Icon = icon[item.status];
          return (
            <li key={item.id} className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <Icon className={`mt-0.5 size-4 shrink-0 ${color[item.status]}`} />
              <div>
                <p className="font-medium">{isKk ? kkCopy[item.id]?.label ?? item.label : item.label}</p>
                <p className="text-slate-600">{isKk ? kkCopy[item.id]?.hint ?? item.hint : item.hint}</p>
                {item.status !== "ok" && (
                  <Link href={`/plans/${planId}/edit`} className="text-xs font-medium text-[#2B2D83] underline">
                    {isKk ? kkCopy[item.id]?.where ?? "Түзету орнын ашыңыз" : item.where} →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
