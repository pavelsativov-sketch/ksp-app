"use client";

import { createContext, useContext } from "react";
import type { KspContent } from "@/lib/types/ksp";

/**
 * Inline-edit mode for PlanView.
 *
 * When a provider with `enabled=true` wraps the tree, every Editable* leaf
 * inside PlanView (EditableText / EditableList / EditableRichText) renders
 * an input/textarea/RichTextEditor instead of plain text, and writes back
 * to the surrounding draft via `update(mutator)`.
 *
 * `update` receives a deep-cloned draft, mutates it in place, and replaces
 * the upstream state. Callers are expected to debounce/save explicitly.
 */
export interface InlineEditCtxValue {
  enabled: boolean;
  draft: KspContent;
  update: (mutator: (draft: KspContent) => void) => void;
}

const InlineEditContext = createContext<InlineEditCtxValue | null>(null);

export function InlineEditProvider({
  enabled,
  draft,
  update,
  children,
}: {
  enabled: boolean;
  draft: KspContent;
  update: (mutator: (draft: KspContent) => void) => void;
  children: React.ReactNode;
}) {
  return (
    <InlineEditContext.Provider value={{ enabled, draft, update }}>
      {children}
    </InlineEditContext.Provider>
  );
}

/** Returns the active context, or `null` when no provider wraps the tree. */
export function useInlineEdit(): InlineEditCtxValue | null {
  return useContext(InlineEditContext);
}

/**
 * Helper for read paths in PlanView: returns the draft content if a provider
 * is active and enabled, otherwise the original content. Pure read.
 */
export function useEditableContent(fallback: KspContent): KspContent {
  const ctx = useContext(InlineEditContext);
  if (ctx?.enabled) return ctx.draft;
  return fallback;
}
