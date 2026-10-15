import { browserTools } from './browser';
import { fileSystemTools } from './file-system';
import { computerTools } from './computer';

export interface ToolCtx {
  taskId: string;
  userId?: string;
}

export const tools = {
  ...browserTools,
  ...fileSystemTools,
  ...computerTools,
};

export type ToolName = keyof typeof tools;
