import { useEffect, useState } from "react";
import type { KspContent } from "@/lib/types/ksp";

const DRAFT_KEY_PREFIX = "ksp-draft:";

export interface DraftState {
  id?: string;
  title: string;
  subjectId: string;
  grade: number;
  quarter: number | null;
  /** Привязка к классу/группе учителя. */
  classId: string;
  section: string;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  content: KspContent;
}

export function usePlanDraft(
  planId: string | undefined,
  initialState: DraftState,
): {
  state: DraftState;
  setState: React.Dispatch<React.SetStateAction<DraftState>>;
  draftSaved: boolean;
  clearDraft: () => void;
} {
  const draftKey = `${DRAFT_KEY_PREFIX}${planId ?? "new"}`;
  const [state, setState] = useState<DraftState>(initialState);
  const [draftSaved, setDraftSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<DraftState>;
          if (saved.content && typeof saved.title === "string") setState((prev) => ({ ...prev, ...saved }));
        }
      } catch { /* ignore malformed or unavailable storage */ }
      setInitialized(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [draftKey, planId]);

  useEffect(() => {
    if (!initialized) return;
    let clearSaved: ReturnType<typeof setTimeout> | undefined;
    const saveTimer = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(state));
        setDraftSaved(true);
        clearSaved = setTimeout(() => setDraftSaved(false), 1500);
      } catch { /* ignore quota errors */ }
    }, 600);
    return () => {
      clearTimeout(saveTimer);
      if (clearSaved) clearTimeout(clearSaved);
    };
  }, [state, draftKey, initialized]);

  function clearDraft() {
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }

  return { state, setState, draftSaved, clearDraft };
}
