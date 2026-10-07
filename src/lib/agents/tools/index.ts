import { browserTools } from './browser';
import { fileSystemTools } from './file-system';

export interface ToolCtx {
  taskId: string;
}

export const tools = {
  ...browserTools,
  ...fileSystemTools,
};

export type ToolName = keyof typeof tools;
