import { getWorkspaceRuntime } from '@/lib/workspace/runtime';

export const fileSystemTools = {
  runCommand: async ({ command, timeoutMs }: { command: string; timeoutMs?: number }, ctx?: { taskId?: string; userId?: string }) => {
    if (typeof command !== 'string' || !command.trim() || command.length > 8_000) {
      return { success: false, error: 'Команда отсутствует или длиннее 8 000 символов' };
    }
    try {
      if (!ctx?.userId) throw new Error('Нет пользователя сессии');
      const { classifyCommand, alwaysAllows, requestPermission } = await import('@/lib/agents/permissions');
      if (classifyCommand(command) === 'high' && !await alwaysAllows(ctx.userId)) {
        const allowed = await requestPermission(ctx.userId, command, 'high');
        if (!allowed) return { success: false, error: 'Команда высокого риска отклонена или запрос разрешения истёк. Выполни безопасный вариант или попроси пользователя разрешить команду.' };
      }
      const runtime = await getWorkspaceRuntime(ctx.userId);
      const result = await runtime.runCommand(command, typeof timeoutMs === 'number' ? timeoutMs : 90_000);
      return { success: result.exitCode === 0, ...result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Команда не выполнена' };
    }
  },
  writeFile: async ({ filename, content }: { filename: string; content: string }, ctx?: { taskId?: string; userId?: string }) => {
    if (typeof filename !== 'string' || typeof content !== 'string' || content.length > 200_000) {
      return { success: false, error: 'Filename or content missing/too large' };
    }
    try {
      if (!ctx?.userId) throw new Error('Нет пользователя сессии');
      const runtime = await getWorkspaceRuntime(ctx.userId);
      await runtime.writeFile(filename, content);
      return { success: true, message: `Файл ${filename} сохранён в изолированной рабочей среде` };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'write failed' };
    }
  },
  readFile: async ({ filename }: { filename: string }, ctx?: { taskId?: string; userId?: string }) => {
    try {
      if (!ctx?.userId) throw new Error('Нет пользователя сессии');
      const runtime = await getWorkspaceRuntime(ctx.userId);
      const content = await runtime.readFile(filename);
      return { success: true, content: content.slice(0, 3000) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'read failed' };
    }
  },
  listFiles: async ({}: Record<string, never>, ctx?: { taskId?: string; userId?: string }) => {
    try {
      if (!ctx?.userId) throw new Error('Нет пользователя сессии');
      const runtime = await getWorkspaceRuntime(ctx.userId);
      const files = (await runtime.listFiles()).map((file) => file.name);
      return { success: true, files: files.slice(0, 100) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'list failed' };
    }
  },
};
