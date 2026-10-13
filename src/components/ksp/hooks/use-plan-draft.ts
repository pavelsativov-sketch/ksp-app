import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { KspContent } from "@/lib/types/ksp";

const DRAFT_KEY_PREFIX = "ksp-draft:";

type LocalDraftStatus = "idle" | "saving" | "saved" | "error";

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

export interface RecoveredDraft {
  state: DraftState;
  savedAt: string | null;
  basedOnUpdatedAt: string | null;
  currentUpdatedAt: string;
}

type StoredDraft = Partial<DraftState> & {
  __baseUpdatedAt?: string | null;
  __savedAt?: string;
};

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.title === "string" &&
    !!draft.content && typeof draft.content === "object" && !Array.isArray(draft.content);
}

export function usePlanDraft(
  planId: string | undefined,
  initialState: DraftState,
  initialServerUpdatedAt?: string,
): {
  state: DraftState;
  setState: Dispatch<SetStateAction<DraftState>>;
  getLatestState: () => DraftState;
  draftSaved: boolean;
  localDraftStatus: LocalDraftStatus;
  lastLocalSavedAt: string | null;
  isOnline: boolean;
  recoveredDraft: RecoveredDraft | null;
  clearDraft: () => void;
  saveDraftNow: (value?: DraftState) => boolean;
  setServerUpdatedAt: (updatedAt: string) => void;
  restoreRecoveredDraft: () => void;
  discardRecoveredDraft: () => void;
} {
  const draftKey = `${DRAFT_KEY_PREFIX}${planId ?? "new"}`;
  const [state, setStateInternal] = useState<DraftState>(initialState);
  const stateRef = useRef(state);
  const initialStateRef = useRef(initialState);
  const serverUpdatedAtRef = useRef(initialServerUpdatedAt);
  const [draftSaved, setDraftSaved] = useState(false);
  const [localDraftStatus, setLocalDraftStatus] = useState<LocalDraftStatus>("idle");
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<RecoveredDraft | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const canPersistRef = useRef(true);
  const scheduledSaveRef = useRef<number | null>(null);
  const savedStatusTimerRef = useRef<number | null>(null);
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    serverUpdatedAtRef.current = initialServerUpdatedAt;
  }, [initialServerUpdatedAt]);

  const setState: Dispatch<SetStateAction<DraftState>> = useCallback((update) => {
    saveGenerationRef.current += 1;
    setDraftSaved(false);
    setLocalDraftStatus("saving");
    setStateInternal((previous) => {
      const next = typeof update === "function" ? update(previous) : update;
      stateRef.current = next;
      return next;
    });
  }, []);

  const getLatestState = useCallback(() => stateRef.current, []);

  const persistDraft = useCallback((value: DraftState): boolean => {
    try {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(draftKey, JSON.stringify({
        ...value,
        __baseUpdatedAt: serverUpdatedAtRef.current ?? null,
        __savedAt: savedAt,
      }));
      canPersistRef.current = true;
      setLastLocalSavedAt(savedAt);
      setDraftSaved(true);
      setLocalDraftStatus("saved");
      if (savedStatusTimerRef.current !== null) window.clearTimeout(savedStatusTimerRef.current);
      const generation = ++saveGenerationRef.current;
      savedStatusTimerRef.current = window.setTimeout(() => {
        if (generation !== saveGenerationRef.current) return;
        setDraftSaved(false);
        setLocalDraftStatus("idle");
        savedStatusTimerRef.current = null;
      }, 1500);
      return true;
    } catch {
      setDraftSaved(false);
      setLocalDraftStatus("error");
      return false;
    }
  }, [draftKey]);

  const saveDraftNow = useCallback((value?: DraftState) => {
    if (scheduledSaveRef.current !== null) {
      window.clearTimeout(scheduledSaveRef.current);
      scheduledSaveRef.current = null;
    }
    return persistDraft(value ?? stateRef.current);
  }, [persistDraft]);

  const clearDraft = useCallback(() => {
    if (scheduledSaveRef.current !== null) {
      window.clearTimeout(scheduledSaveRef.current);
      scheduledSaveRef.current = null;
    }
    try {
      window.localStorage.removeItem(draftKey);
      canPersistRef.current = true;
      setRecoveredDraft(null);
      setLastLocalSavedAt(null);
      setDraftSaved(false);
      setLocalDraftStatus("idle");
    } catch {
      setLocalDraftStatus("error");
    }
  }, [draftKey]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (!isStoredDraft(saved)) {
            canPersistRef.current = false;
            setLocalDraftStatus("error");
          } else {
            const {
              __baseUpdatedAt,
              __savedAt,
              ...fields
            } = saved;
            const restored: DraftState = {
              ...initialStateRef.current,
              ...fields,
              id: initialStateRef.current.id ?? (typeof saved.id === "string" ? saved.id : undefined),
              content: saved.content as KspContent,
            };
            const basedOnUpdatedAt = typeof __baseUpdatedAt === "string" ? __baseUpdatedAt : null;
            setLastLocalSavedAt(typeof __savedAt === "string" ? __savedAt : null);
            setDraftSaved(true);
            setLocalDraftStatus("saved");
            if (planId && initialServerUpdatedAt && basedOnUpdatedAt !== initialServerUpdatedAt) {
              setRecoveredDraft({
                state: restored,
                savedAt: typeof __savedAt === "string" ? __savedAt : null,
                basedOnUpdatedAt,
                currentUpdatedAt: initialServerUpdatedAt,
              });
            } else {
              setStateInternal((previous) => {
                const next = { ...previous, ...restored, id: previous.id ?? restored.id };
                stateRef.current = next;
                return next;
              });
            }
          }
        }
      } catch {
        // Preserve unreadable local data; do not overwrite it with the server copy.
        canPersistRef.current = false;
        setLocalDraftStatus("error");
      }
      setInitialized(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [draftKey, initialServerUpdatedAt, planId]);

  useEffect(() => {
    if (!initialized || recoveredDraft || !canPersistRef.current) return;
    const timer = window.setTimeout(() => {
      scheduledSaveRef.current = null;
      persistDraft(state);
    }, 600);
    scheduledSaveRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (scheduledSaveRef.current === timer) scheduledSaveRef.current = null;
    };
  }, [state, draftKey, initialized, recoveredDraft, persistDraft]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(window.navigator.onLine);
    const timer = window.setTimeout(updateOnlineStatus, 0);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => () => {
    if (savedStatusTimerRef.current !== null) window.clearTimeout(savedStatusTimerRef.current);
  }, []);

  const setServerUpdatedAt = useCallback((updatedAt: string) => {
    serverUpdatedAtRef.current = updatedAt;
  }, []);

  const restoreRecoveredDraft = useCallback(() => {
    if (!recoveredDraft) return;
    setState({ ...recoveredDraft.state, id: stateRef.current.id ?? recoveredDraft.state.id });
    setRecoveredDraft(null);
  }, [recoveredDraft, setState]);

  const discardRecoveredDraft = useCallback(() => {
    setRecoveredDraft(null);
    clearDraft();
  }, [clearDraft]);

  return {
    state,
    setState,
    getLatestState,
    draftSaved,
    localDraftStatus,
    lastLocalSavedAt,
    isOnline,
    recoveredDraft,
    clearDraft,
    saveDraftNow,
    setServerUpdatedAt,
    restoreRecoveredDraft,
    discardRecoveredDraft,
  };
}
