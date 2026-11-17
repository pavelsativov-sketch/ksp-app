import type { AdminOverview, DailyPoint } from "@/lib/admin/users";
import s from "./admin.module.css";

const fmt = (n: number) => n.toLocaleString("ru-RU");
const SERIES: Array<{ key: keyof Omit<DailyPoint, "day">; label: string; color: string }> = [
  { key: "users", label: "Новые пользователи", color: "#8b63ff" },
  { key: "plans", label: "Созданные КСП", color: "#6d3bea" },
  { key: "generations", label: "AI-генерации КСП", color: "#e08a2e" },
];

function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const width = 720;
  const height = 200;
  const pad = 24;
  const max = Math.max(1, ...daily.flatMap((d) => SERIES.map((series) => d[series.key])));
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(1, daily.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  return <figure className="grid gap-2">
    <svg viewBox={`0 0 ${width} ${height}`} className={s.chart} role="img" aria-label="Активность за 30 дней по дням">
      {[0, 0.5, 1].map((t) => <g key={t}>
        <line x1={pad} x2={width - pad} y1={y(max * t)} y2={y(max * t)} stroke="var(--border)" strokeDasharray={t ? "4 4" : undefined} />
        <text x={2} y={y(max * t) + 4} fontSize="11" fill="var(--muted-foreground)">{Math.round(max * t)}</text>
      </g>)}
      {SERIES.map((series) => <polyline key={series.key} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        points={daily.map((d, i) => `${x(i)},${y(d[series.key])}`).join(" ")} />)}
      {daily.map((d, i) => <rect key={d.day} x={x(i) - 6} y={pad} width={12} height={height - pad * 2} fill="transparent">
        <title>{`${d.day}: пользователи ${d.users}, КСП ${d.plans}, генерации ${d.generations}`}</title>
      </rect>)}
    </svg>
    <figcaption className={s.legend}>
      {SERIES.map((series) => <span key={series.key}><span className={s.dot} style={{ background: series.color }} />{series.label}</span>)}
      <span className="ml-auto">{daily[0]?.day} — {daily[daily.length - 1]?.day} (UTC)</span>
    </figcaption>
  </figure>;
}

export function AdminOverviewPanel({ data }: { data: AdminOverview }) {
  const cards: Array<[string, number, string?]> = [
    ["Всего пользователей", data.totalUsers],
    ["Новые за 7 дней", data.newUsers7, `за 30 дней: ${fmt(data.newUsers30)}`],
    ["Активные за 7 дней", data.activeUsers7, "планы или AI"],
    ["КСП за 7 дней", data.plans7, `за 30 дней: ${fmt(data.plans30)}`],
    ["AI-генерации за 7 дней", data.generations7, `за 30 дней: ${fmt(data.generations30)}`],
    ["Сбои AI за 7 дней", data.failures7, `за 30 дней: ${fmt(data.failures30)}`],
    ["Pro (действует)", data.tiers.pro],
    ["Free", data.tiers.free],
  ];
  return <section aria-labelledby="overview-title" className="space-y-4">
    <h2 id="overview-title" className="text-2xl font-semibold">Обзор</h2>
    <div className={s.cards}>{cards.map(([label, value, hint]) => <div key={label} className={s.card}>
      <p className={s.cardLabel}>{label}</p><p className={s.cardValue}>{fmt(value)}</p>{hint && <p className={s.cardHint}>{hint}</p>}
    </div>)}</div>
    <div className={s.panel}><h3 className={s.panelTitle}>По дням, 30 дней</h3><DailyChart daily={data.daily} /></div>
  </section>;
}
