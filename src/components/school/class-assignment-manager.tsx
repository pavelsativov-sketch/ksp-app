"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MemberOption {
  user_id: string;
  full_name: string;
  role: "teacher";
}

interface Assignment {
  _id: string;
  teacher_id: string;
  class_name: string;
}

interface Copy {
  classAssignmentsTitle: string;
  classAssignmentsDescription: string;
  teacher: string;
  className: string;
  assign: string;
  assigning: string;
  revoke: string;
  revokeConfirm: string;
  loading: string;
  emptyAssignments: string;
  noClasses: string;
  saved: string;
  error: string;
}

export function ClassAssignmentManager({
  schoolId,
  classes,
  members,
  labels,
}: {
  schoolId: string;
  classes: string[];
  members: MemberOption[];
  labels: Copy;
}) {
  const endpoint = `/api/school/${schoolId}/class-assignments`;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teacherId, setTeacherId] = useState(members[0]?.user_id ?? "");
  const [className, setClassName] = useState(classes[0] ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json() as { assignments?: Assignment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? labels.error);
      setAssignments(data.assignments ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.error);
    } finally {
      setLoading(false);
    }
  }, [endpoint, labels.error]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teacherId || !className || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, className }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? labels.error);
      setNotice(labels.saved);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.error);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(assignmentId: string) {
    if (!window.confirm(labels.revokeConfirm) || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? labels.error);
      setNotice(labels.saved);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4" aria-labelledby="class-assignment-title">
      <div>
        <h2 id="class-assignment-title" className="text-lg font-semibold">{labels.classAssignmentsTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.classAssignmentsDescription}</p>
      </div>
      {classes.length === 0 ? <p className="text-sm text-muted-foreground">{labels.noClasses}</p> : members.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={(event) => void assign(event)}>
          <label className="grid gap-1 text-sm">
            <span>{labels.teacher}</span>
            <select className="min-h-11 rounded-md border border-input bg-background px-3" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} required>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{labels.className}</span>
            <select className="min-h-11 rounded-md border border-input bg-background px-3" value={className} onChange={(event) => setClassName(event.target.value)} required>
              {classes.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" className="min-h-11 w-full" disabled={saving || !teacherId || !className}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              <span>{saving ? labels.assigning : labels.assign}</span>
            </Button>
          </div>
        </form>
      )}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{labels.loading}</p> : assignments.length === 0 ? <p className="text-sm text-muted-foreground">{labels.emptyAssignments}</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {assignments.map((assignment) => {
            const teacher = members.find((member) => member.user_id === assignment.teacher_id);
            return <li key={assignment._id} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{teacher?.full_name ?? assignment.teacher_id} · {assignment.class_name}</span>
              <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={saving} onClick={() => void revoke(assignment._id)}>
                <UserRoundX className="size-4" aria-hidden="true" /><span>{labels.revoke}</span>
              </Button>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
