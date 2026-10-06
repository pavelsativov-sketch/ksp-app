"use client";

import { useRouter } from "next/navigation";
import { TemplatesManager } from "./templates-manager";
import type { TemplateRow } from "@/lib/templates";

/**
 * Серверная страница передаёт данные, клиентская — сам переход в конструктор
 * с выбранным шаблоном и темой.
 */
export function TemplatesManagerClient({
  templates,
  subjects,
}: {
  templates: TemplateRow[];
  subjects: Array<{ id: string; name_ru: string }>;
}) {
  const router = useRouter();
  return (
    <TemplatesManager
      templates={templates}
      subjects={subjects}
      onUse={(templateId, topic) => {
        router.push(
          `/plans/new?templateId=${encodeURIComponent(templateId)}&topic=${encodeURIComponent(topic)}`,
        );
      }}
    />
  );
}
