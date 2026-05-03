"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { autosavePlanAction } from "@/app/actions/plans";
import type { KspContent } from "@/lib/types/ksp";

interface DraftSnapshot {
  title: string;
  subjectId: string;
  grade: number;
  quarter: number | null;
  section: string;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  content: KspContent;
}

/**
 * Local-storage draft autosave. Fires 600ms after the last edit and
 * persists the entire form state under `ksp-draft:<id|new>` so the
 * draft survives an accidental refresh or tab close.
 */
export function useDraftAutosave({
  draftKey,
  snapshot,
}: {
  draftKey: string;
  snapshot: DraftSnapshot;
}): { draftSaved: boolean } {
  const [draftSaved, setDraftSaved] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(snapshot));
        setDraftSaved(true);
        const t = window.setTimeout(() => setDraftSaved(false), 1500);
        return () => window.clearTimeout(t);
      } catch {
        // ignore quota errors
      }
    }, 600);
    return () => window.clearTimeout(h);
  }, [draftKey, snapshot]);
  return { draftSaved };
}

/**
 * Server autosave for an *existing* plan. Writes title + content to the
 * lesson_plans row 2s after the last edit. Skipped until the user has
 * made a real edit (`userTouchedRef.current === true`) so we don't hit
 * the DB on page load.
 *
 * Returns the persistence status so the caller can render
 * "Сохраняем в облако…" / "Сохранено в облаке HH:MM".
 */
export function useCloudAutosave({
  planId,
  title,
  content,
  userTouchedRef,
}: {
  planId: string | undefined;
  title: string;
  content: KspContent;
  userTouchedRef: MutableRefObject<boolean>;
}): {
  cloudSaving: boolean;
  cloudSavedAt: string | null;
  cloudError: string | null;
} {
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudSavedAt, setCloudSavedAt] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!planId) return;
    if (!userTouchedRef.current) return;
    const h = window.setTimeout(() => {
      setCloudSaving(true);
      setCloudError(null);
      autosavePlanAction({
        id: planId,
        title: title || content.topic || "Без названия",
        content,
      })
        .then((res) => {
          if ("error" in res && res.error) setCloudError(res.error);
          else if ("savedAt" in res && res.savedAt)
            setCloudSavedAt(res.savedAt);
        })
        .catch((e) =>
          setCloudError(e instanceof Error ? e.message : "save failed"),
        )
        .finally(() => setCloudSaving(false));
    }, 2000);
    return () => window.clearTimeout(h);
  }, [planId, title, content, userTouchedRef]);

  return { cloudSaving, cloudSavedAt, cloudError };
}
