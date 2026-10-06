import fs from 'fs/promises';
import path from 'path';
import { machineDir } from '../session';

/**
 * Файлы агента живут в машине пользователя — той же среде, где работает
 * постоянная оболочка и файловый менеджер. path.basename не даёт выйти
 * за пределы корня машины.
 */
async function safePath(userId: string | undefined, filename: string): Promise<string> {
  const dir = await machineDir(userId ?? 'misc');
  return path.join(dir, path.basename(filename));
}

export const fileSystemTools = {
  writeFile: async ({ filename, content }: { filename: string; content: string }, ctx?: { taskId?: string; userId?: string }) => {
    if (typeof filename !== 'string' || typeof content !== 'string' || content.length > 200_000) {
      return { success: false, error: 'Filename or content missing/too large' };
    }
    try {
      const p = await safePath(ctx?.userId, filename);
      await fs.writeFile(p, content, 'utf8');
      return { success: true, message: `Файл ${path.basename(filename)} сохранён в рабочей машине` };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'write failed' };
    }
  },
  readFile: async ({ filename }: { filename: string }, ctx?: { taskId?: string; userId?: string }) => {
    try {
      const p = await safePath(ctx?.userId, filename);
      const content = await fs.readFile(p, 'utf8');
      return { success: true, content: content.slice(0, 3000) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'read failed' };
    }
  },
  listFiles: async ({}: Record<string, never>, ctx?: { taskId?: string; userId?: string }) => {
    try {
      const dir = await machineDir(ctx?.userId ?? 'misc');
      const files = await fs.readdir(dir);
      return { success: true, files: files.slice(0, 100) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'list failed' };
    }
  },
};
