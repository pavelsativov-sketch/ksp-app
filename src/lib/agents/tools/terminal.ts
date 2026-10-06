import { shellExec } from '../session';

export const terminalTools = {
  /**
   * Агент выполняет команды В ТОЙ ЖЕ постоянной оболочке, что и пользователь:
   * общие cwd, файлы и состояние. Это настоящая среда, а не имитация.
   */
  executeCommand: async ({ cmd }: { cmd: string }, ctx?: { userId?: string }) => {
    if (typeof cmd !== 'string' || cmd.trim().length === 0 || cmd.length > 4000) {
      return { success: false, error: 'Команда пуста или слишком длинная' };
    }
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const { output, timedOut } = await shellExec(ctx.userId, cmd, 60_000);
    return {
      success: !timedOut,
      output: output || '(команда выполнена, вывода нет)',
      ...(timedOut ? { note: 'Команда ещё выполняется — вывод частичный. Долгие процессы запускайте в фоне.' } : {}),
    };
  },
};
