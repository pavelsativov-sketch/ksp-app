import { create } from 'zustand';

export interface TerminalEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

/** Ответ GET /api/agents/terminal: где и в какой оболочке выполняются команды. */
export interface TerminalInfo {
  available?: boolean;
  status?: string;
  error?: string;
  cwd?: string;
  mode?: string;
  shell?: string;
}

const MAX_ENTRIES = 200;
const MAX_HISTORY = 100;

interface TerminalStore {
  entries: TerminalEntry[];
  history: string[];
  /** Последние известные сведения о среде: нужны сразу при возврате на вкладку. */
  info: TerminalInfo | null;
  setInfo: (info: TerminalInfo) => void;
  addEntry: (entry: TerminalEntry) => void;
  addHistory: (command: string) => void;
  clear: () => void;
}

/**
 * Сеанс терминала живёт в хранилище, а не в состоянии компонента: вкладка
 * «Терминал» размонтируется при переключении на другое приложение, и вывод
 * с историей команд пропадали бы при каждом возвращении.
 */
export const useTerminalStore = create<TerminalStore>((set) => ({
  entries: [],
  history: [],
  info: null,
  setInfo: (info) => set({ info }),
  addEntry: (entry) => set((state) => ({ entries: [...state.entries, entry].slice(-MAX_ENTRIES) })),
  addHistory: (command) => set((state) => ({
    history: (state.history[state.history.length - 1] === command ? state.history : [...state.history, command]).slice(-MAX_HISTORY),
  })),
  clear: () => set({ entries: [] }),
}));
