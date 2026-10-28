import { browserTools } from './browser';
import { fileSystemTools } from './file-system';

export interface ToolCtx {
  taskId: string;
  userId?: string;
  /** Срабатывает, когда пользователь остановил задачу. */
  signal?: AbortSignal;
  /** Пульс раннера для долгих ожиданий внутри инструмента. */
  beat?: () => Promise<void>;
  /** Крайний срок задачи, мс с эпохи. */
  deadline?: number;
}

export const tools = {
  ...browserTools,
  ...fileSystemTools,
};

export type ToolName = keyof typeof tools;
