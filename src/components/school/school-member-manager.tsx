"use client";

import { useState } from "react";
import { Check, Loader2, UserRoundMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS, type SchoolPermission, type SchoolRole } from "@/lib/school/role-matrix";

interface Member {
  user_id: string;
  full_name: string;
  role: SchoolRole;
  subject?: string;
  granted_permissions?: SchoolPermission[];
}

interface Copy {
  roleLabels: Record<SchoolRole, string>;
  permissionLabels: Record<SchoolPermission, string>;
  permissions: string;
  role: string;
  save: string;
  saving: string;
  saved: string;
  remove: string;
  removeConfirm: string;
  error: string;
  noChanges: string;
}

export function SchoolMemberManager({
  schoolId,
  initialMembers,
  labels,
}: {
  schoolId: string;
  initialMembers: Member[];
  labels: Copy;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [drafts, setDrafts] = useState<Record<string, { role: Exclude<SchoolRole, "director">; grants: SchoolPermission[] }>>(() =>
    Object.fromEntries(initialMembers.filter((member) => member.role !== "director").map((member) => [
      member.user_id,
      { role: member.role as Exclude<SchoolRole, "director">, grants: member.granted_permissions ?? [] },
    ])),
  );
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/school/${schoolId}/members`;

  function patchDraft(userId: string, patch: Partial<{ role: Exclude<SchoolRole, "director">; grants: SchoolPermission[] }>) {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
  }

  async function save(member: Member) {
    const draft = drafts[member.user_id];
    if (!draft || busyId) return;
    setBusyId(member.user_id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: member.user_id,
          role: draft.role,
          granted_permissions: draft.role === "admin" ? draft.grants : [],
        }),
      });
      if (!response.ok) throw new Error(labels.error);
      setMembers((current) => current.map((item) => item.user_id === member.user_id
        ? { ...item, role: draft.role, granted_permissions: draft.role === "admin" ? draft.grants : [] }
        : item));
      setMessage(labels.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.error);
    } finally {
      setBusyId("");
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`${labels.removeConfirm} ${member.full_name}?`) || busyId) return;
    setBusyId(member.user_id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.user_id }),
      });
      if (!response.ok) throw new Error(labels.error);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setMessage(labels.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.error);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-4" aria-label={labels.permissions}>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-3">
        {members.map((member) => {
          if (member.role === "director") {
            return <li key={member.user_id} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">{member.full_name}{member.subject ? <span className="text-muted-foreground"> · {member.subject}</span> : null}</p>
              <p className="mt-1 text-sm text-muted-foreground">{labels.roleLabels.director}</p>
            </li>;
          }
          const draft = drafts[member.user_id] ?? { role: member.role, grants: member.granted_permissions ?? [] };
          const saving = busyId === member.user_id;
          return <li key={member.user_id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.full_name}{member.subject ? <span className="text-muted-foreground"> · {member.subject}</span> : null}</p>
                <p className="mt-1 text-xs text-muted-foreground">{labels.roleLabels[member.role]}</p>
              </div>
              <label className="grid min-w-40 gap-1 text-sm">
                <span>{labels.role}</span>
                <select aria-label={`${labels.role}: ${member.full_name}`} className="min-h-11 rounded-md border border-input bg-background px-3" value={draft.role} onChange={(event) => patchDraft(member.user_id, { role: event.target.value as Exclude<SchoolRole, "director"> })}>
                  <option value="teacher">{labels.roleLabels.teacher}</option>
                  <option value="deputy">{labels.roleLabels.deputy}</option>
                  <option value="admin">{labels.roleLabels.admin}</option>
                </select>
              </label>
            </div>
            {draft.role === "admin" && <fieldset aria-label={`${labels.permissions}: ${member.full_name}`} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">{labels.permissions}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.entries(labels.permissionLabels) as [SchoolPermission, string][]).filter(([permission]) => !SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission)).map(([permission, label]) => (
                  <label key={permission} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.grants.includes(permission)}
                      onChange={(event) => patchDraft(member.user_id, { grants: event.target.checked
                        ? [...new Set([...draft.grants, permission])]
                        : draft.grants.filter((item) => item !== permission) })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11" disabled={Boolean(busyId)} onClick={() => void save(member)}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                <span>{saving ? labels.saving : labels.save}</span>
              </Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={Boolean(busyId)} onClick={() => void remove(member)}>
                <UserRoundMinus className="size-4" aria-hidden="true" /><span>{labels.remove}</span>
              </Button>
            </div>
          </li>;
        })}
      </ul>
    </section>
  );
}
