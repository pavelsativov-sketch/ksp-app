export const computerTools = {
  async runCommand(args: Record<string, unknown>, ctx: { taskId: string; userId?: string }) {
    const { classifyCommand, requestPermission } = await import('@/lib/agents/permissions');
    const { runExecutor } = await import('@/lib/agents/computer/execute');

    const command = typeof args.command === 'string' ? args.command.trim() : '';
    const argv = Array.isArray(args.args) ? (args.args as string[]) : [];
    if (!command) return { success: false, error: 'No command provided' };

    const risk = classifyCommand(command + ' ' + argv.join(' '));
    const userId = ctx.userId ?? '';
    const allowed = await requestPermission(userId, command + ' ' + argv.join(' '), risk);
    if (!allowed) return { success: false, error: 'Permission denied for command' };

    const res = await runExecutor(userId || 'unknown', command, argv, Number(args.timeoutMs ?? 30000));
    if (!res.ok) return { success: false, error: res.error ?? 'executor error' };
    return {
      success: true,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      exitCode: res.code ?? null,
    };
  },
};
