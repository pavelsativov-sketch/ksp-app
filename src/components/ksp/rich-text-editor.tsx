"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Heading2,
  Link2,
  ImagePlus,
  Loader2,
  Quote,
  Undo2,
  Redo2,
} from "lucide-react";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  /** When provided, image upload button is shown and uploaded files go through this hook. */
  onUploadImage?: (file: File) => Promise<string>;
}

/**
 * Rich-text editor for stage actions (teacher / student).
 *
 * Storage: HTML string. Backward-compat — if `value` is plain text without
 * any HTML tags, it is wrapped in <p> on first edit. Display side uses
 * `RichTextRender` which auto-detects.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  onUploadImage,
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { HTMLAttributes: { class: "list-disc pl-5" } },
        orderedList: { HTMLAttributes: { class: "list-decimal pl-5" } },
        heading: { levels: [2, 3] },
        codeBlock: { HTMLAttributes: { class: "rounded bg-slate-900 text-slate-100 p-2 text-xs font-mono" } },
        code: { HTMLAttributes: { class: "rounded bg-slate-100 px-1 py-0.5 text-xs font-mono" } },
        blockquote: { HTMLAttributes: { class: "border-l-2 border-slate-300 pl-3 italic text-slate-600" } },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-sky-600 underline" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Image.configure({
        HTMLAttributes: { class: "rounded border border-slate-200 max-w-full" },
      }),
    ],
    content: toInitialContent(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `tiptap-content text-sm focus:outline-none px-3 py-2`,
        style: `min-height: ${rows * 1.5}rem`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const isEmpty = editor.isEmpty;
      onChange(isEmpty ? "" : html);
    },
  });

  // Sync external value changes (e.g. AI-generated content swaps in)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = toInitialContent(value);
    if (current !== incoming && incoming !== "<p></p>") {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="border rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-400">
        Загрузка редактора…
      </div>
    );
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage || !editor) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      console.error("[rich-text] upload failed", err);
      alert("Не удалось загрузить картинку");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function promptLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL ссылки", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-sky-200 transition">
      <Toolbar
        editor={editor}
        uploading={uploading}
        onImageClick={() => fileInputRef.current?.click()}
        onLinkClick={promptLink}
        showImage={!!onUploadImage}
      />
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
    </div>
  );
}

function Toolbar({
  editor,
  uploading,
  onImageClick,
  onLinkClick,
  showImage,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  uploading: boolean;
  onImageClick: () => void;
  onLinkClick: () => void;
  showImage: boolean;
}) {
  const btn =
    "p-1.5 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed";
  const active = "bg-slate-200 text-slate-900";
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1 bg-slate-50/50 rounded-t-md">
      <button
        type="button"
        className={`${btn} ${editor.isActive("bold") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Жирный (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`${btn} ${editor.isActive("italic") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Курсив (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`${btn} ${editor.isActive("heading", { level: 2 }) ? active : ""}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Подзаголовок"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-slate-300" />
      <button
        type="button"
        className={`${btn} ${editor.isActive("bulletList") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Маркированный список"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`${btn} ${editor.isActive("orderedList") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Нумерованный список"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`${btn} ${editor.isActive("blockquote") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Цитата"
      >
        <Quote className="w-4 h-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-slate-300" />
      <button
        type="button"
        className={`${btn} ${editor.isActive("code") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Инлайн-код"
      >
        <Code className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`${btn} ${editor.isActive("link") ? active : ""}`}
        onClick={onLinkClick}
        title="Ссылка"
      >
        <Link2 className="w-4 h-4" />
      </button>
      {showImage && (
        <button
          type="button"
          className={btn}
          onClick={onImageClick}
          disabled={uploading}
          title="Картинка"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-slate-300" />
      <button
        type="button"
        className={btn}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Отменить (Ctrl+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Повторить (Ctrl+Y)"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Convert legacy plain-text content to HTML for the editor's initial state.
 * Anything containing < and > is treated as already-HTML.
 */
function toInitialContent(value: string): string {
  if (!value) return "";
  if (/<\w+[^>]*>/.test(value)) return value;
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
  return escaped;
}

/**
 * Pure function: convert stored stage content to plain text. Used by .docx
 * exporter and other server-side consumers that can't run a DOM parser.
 */
export function richTextToPlain(value: string): string {
  if (!value) return "";
  if (!/<\w+[^>]*>/.test(value)) return value;
  return value
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
