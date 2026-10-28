'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { AgentSession } from '@/components/agents/agent-session';
import { useActiveAgentTask } from '@/components/agents/agent-dock';

/**
 * Журнал агента: ход работы активной задачи (план, команды, результаты).
 *
 * Раньше окно запускало собственный мини-чат с отдельным SSE-разбором и
 * английскими подписями, а журнал уже идущей задачи не показывал вовсе:
 * с иконки открывалась пустая страница «введите задание». Теперь это тот же
 * журнал, что и в чате слева, на ту же задачу.
 */
export function AgentLogApp() {
  const task = useActiveAgentTask();

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0f0f1a] p-6 text-center text-white/40">
        <Bot className="size-14 text-white/15" aria-hidden="true" />
        <p className="text-sm">Журнал появится, когда вы запустите задачу.</p>
        <p className="max-w-sm text-xs text-white/30">
          Опишите задачу в чате слева — здесь будет виден план, выполненные команды и результат работы агента.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      <AgentSession taskId={task.id} />
    </div>
  );
}
