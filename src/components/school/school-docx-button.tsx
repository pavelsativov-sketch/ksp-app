"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SchoolDocxButton({
  title,
  subtitle,
  content,
  language = "ru",
}: {
  title: string;
  subtitle?: string;
  content: string;
  language?: "ru" | "kz";
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/school/ai-tools/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, subtitle, content, language }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.slice(0, 60)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleDownload()}
      disabled={downloading}
      className="gap-1.5 text-xs"
    >
      {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      Word (.docx)
    </Button>
  );
}
