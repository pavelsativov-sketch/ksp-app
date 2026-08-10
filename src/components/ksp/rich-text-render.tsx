"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote", "code", "pre",
  "a", "img", "span", "div",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "target", "rel"];

/**
 * Render HTML safely. Falls back to plain-text rendering with whitespace
 * preservation when `value` doesn't look like HTML (legacy plain text from
 * pre-PR3 plans).
 */
export function RichTextRender({
  value,
  className = "tiptap-content text-sm",
  empty = "—",
}: {
  value?: string | null;
  className?: string;
  empty?: string;
}) {
  const html = useMemo(() => {
    if (!value) return "";
    if (!/<\w+[^>]*>/.test(value)) {
      const escaped = value
        .split(/\n{2,}/)
        .map(
          (block) =>
            `<p>${block
              .split("\n")
              .map((line) =>
                line
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;"),
              )
              .join("<br/>")}</p>`,
        )
        .join("");
      return DOMPurify.sanitize(escaped, { ALLOWED_TAGS, ALLOWED_ATTR });
    }
    return DOMPurify.sanitize(value, { ALLOWED_TAGS, ALLOWED_ATTR });
  }, [value]);

  if (!html) return <span className="text-slate-400">{empty}</span>;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
