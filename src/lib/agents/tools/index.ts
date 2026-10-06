import { browserTools } from './browser';
import { terminalTools } from './terminal';
import { fileSystemTools } from './file-system';

export interface ToolCtx {
  taskId: string;
}

export const tools = {
  ...browserTools,
  ...terminalTools,
  ...fileSystemTools,
};

export type ToolName = keyof typeof tools;
