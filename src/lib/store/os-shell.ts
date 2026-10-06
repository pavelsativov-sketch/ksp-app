import { create } from "zustand";

/**
 * Вкладки рабочего стола внутри рабочей области `/school`.
 *
 * Состояние вынесено в стор, потому что вкладку переключают из двух мест:
 * верхние табы правой панели и плитки левого рельса (Файлы, ОС). Раньше
 * вкладка жила локально в SchoolWorkspace, и рельс не мог её переключить
 * без полной перезагрузки по ссылке.
 */
export type OsTab = "os" | "browser" | "files" | "terminal" | "log" | "editor";

interface OsShellStore {
  tab: OsTab;
  setTab: (tab: OsTab) => void;
}

export const useOsShellStore = create<OsShellStore>((set) => ({
  tab: "os",
  setTab: (tab) => set({ tab }),
}));
