import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assignmentAnalyticsCopy } from "@/components/assignments/assignment-preview-copy";
import type { AssignmentResults } from "@/lib/assignments";
import type { Locale } from "@/lib/i18n/dictionaries";

type Analytics = AssignmentResults["analytics"];

function Metrics({
  participants,
  responseCount,
  correctCount,
  incorrectCount,
  accuracyPercent,
  attemptCount,
  omittedCount,
  suppressed,
  minimumGroupSize,
  locale,
}: {
  participants: number | null;
  responseCount: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  accuracyPercent: number | null;
  attemptCount: number | null;
  omittedCount: number | null;
  suppressed: boolean;
  minimumGroupSize: number;
  locale: Locale;
}) {
  const copy = assignmentAnalyticsCopy[locale];
  if (suppressed || participants === null || responseCount === null || correctCount === null || incorrectCount === null || attemptCount === null) {
    return <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.suppressed(minimumGroupSize)}</p>;
  }
  if (responseCount === 0 || accuracyPercent === null) {
    return <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.noResponses}</p>;
  }

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-6">
        <div><dt className="text-muted-foreground">{copy.participants}</dt><dd className="font-semibold">{participants}</dd></div>
        <div><dt className="text-muted-foreground">{copy.responses}</dt><dd className="font-semibold">{responseCount}</dd></div>
        <div><dt className="text-muted-foreground">{copy.correct}</dt><dd className="font-semibold">{correctCount}</dd></div>
        <div><dt className="text-muted-foreground">{copy.incorrect}</dt><dd className="font-semibold">{incorrectCount}</dd></div>
        <div><dt className="text-muted-foreground">{copy.attempts}</dt><dd className="font-semibold">{attemptCount}</dd></div>
        <div><dt className="text-muted-foreground">{copy.omitted}</dt><dd className="font-semibold">{omittedCount ?? "—"}</dd></div>
      </dl>
      <div>
        <p className="text-xs text-muted-foreground">{copy.accuracy}: {accuracyPercent}%</p>
        <div
          role="meter"
          aria-label={copy.accuracy}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={accuracyPercent}
          className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${accuracyPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

export function AssignmentAnalytics({ analytics, locale }: { analytics: Analytics; locale: Locale }) {
  const copy = assignmentAnalyticsCopy[locale];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.lead}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!analytics.hasData ? (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{copy.noData}</p>
        ) : (
          <>
            <section aria-labelledby="assignment-task-analytics-title" className="space-y-3">
              <h2 id="assignment-task-analytics-title" className="text-sm font-semibold">{copy.taskSection}</h2>
              <div className="space-y-3">
                {analytics.tasks.map((task) => (
                  <article key={task.taskIndex} className="space-y-2 rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold">{task.taskIndex + 1}. {task.question}</h3>
                    <p className="text-xs text-muted-foreground">{copy.objectiveLabel}: {task.objectiveCode ?? copy.unlinkedObjective}</p>
                    <Metrics {...task} minimumGroupSize={analytics.minimumGroupSize} locale={locale} />
                  </article>
                ))}
              </div>
            </section>
            <section aria-labelledby="assignment-objective-analytics-title" className="space-y-3">
              <h2 id="assignment-objective-analytics-title" className="text-sm font-semibold">{copy.objectiveSection}</h2>
              <div className="space-y-3">
                {analytics.objectives.map((objective, index) => (
                  <article key={`${objective.objectiveCode ?? "none"}-${index}`} className="space-y-2 rounded-xl border border-border p-4">
                    <h3 className="text-sm font-semibold">{objective.objectiveCode ?? copy.unlinkedObjective}</h3>
                    <Metrics {...objective} minimumGroupSize={analytics.minimumGroupSize} locale={locale} />
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
        <p className="text-xs text-muted-foreground">{copy.privacyNote}</p>
      </CardContent>
    </Card>
  );
}
