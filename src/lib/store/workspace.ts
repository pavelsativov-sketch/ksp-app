import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Тип приложения в рабочей области.
 *
 * Раньше здесь были ещё `ksp-builder` и `analytics`, но `AppContent` их не
 * разбирал: окно такого типа открывалось пустым. Типы без содержимого вводили
 * в заблуждение при написании кода — компилятор молча соглашался, а учитель
 * видел пустое окно. Список теперь совпадает с тем, что действительно
 * отрисовывается.
 */
export type AppType = 'browser' | 'terminal' | 'file-manager' | 'code-editor' | 'agent-log' | 'computer-use' | 'iframe';

export interface WindowState {
  id: string;
  title: string;
  type: AppType;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  url?: string;
  content?: string;
  /** Что открыть в редакторе: имя файла из песочницы. */
  file?: string;
}

interface WorkspaceStore {
  windows: WindowState[];
  activeWindowId: string | null;
  openWindow: (id: string, title: string, type: AppType, url?: string, file?: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  /** Hides every open app window to reveal the desktop. */
  minimizeAll: () => void;
  /** Открывает файл песочницы в редакторе, создавая окно при первом разе. */
  openInEditor: (file: string) => void;
  closeAll: () => void;
}

/** Окно редактора создаётся один и показывает выбранный файл. */
const EDITOR_WINDOW_ID = 'sandbox-editor';
const EDITOR_TITLE = 'Редактор кода';

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      windows: [],
      activeWindowId: null,
      openWindow: (id, title, type, url, file) => set((state) => {
        const existing = state.windows.find(w => w.id === id);
        const maxZ = state.windows.length > 0 ? Math.max(...state.windows.map(w => w.zIndex)) : 0;
        if (existing) {
          return {
            windows: state.windows.map(w =>
              w.id === id ? { ...w, isMinimized: false, zIndex: maxZ + 1, ...(url ? { url } : {}), ...(file ? { file } : {}) } : w
            ),
            activeWindowId: id
          };
        }
        return {
          windows: [...state.windows, {
            id, title, type, url, file, isOpen: true, isMinimized: false, isMaximized: false, zIndex: maxZ + 1
          }],
          activeWindowId: id
        };
      }),
      closeWindow: (id) => set((state) => ({
        windows: state.windows.filter(w => w.id !== id),
        // Активным становится верхнее из оставшихся, а не «никакое»:
        // иначе после закрытия окна панель задач теряла фокус без причины.
        activeWindowId: state.activeWindowId === id
          ? (() => {
              const rest = state.windows.filter(w => w.id !== id && !w.isMinimized);
              if (rest.length === 0) return null;
              return rest.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b)).id;
            })()
          : state.activeWindowId
      })),
      minimizeWindow: (id) => set((state) => {
        const nextActive = state.activeWindowId === id
          ? (() => {
              const rest = state.windows.filter(w => w.id !== id && !w.isMinimized);
              if (rest.length === 0) return null;
              return rest.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b)).id;
            })()
          : state.activeWindowId;
        return {
          windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: true } : w),
          activeWindowId: nextActive
        };
      }),
      maximizeWindow: (id) => set((state) => ({
        windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w)
      })),
      focusWindow: (id) => set((state) => {
        if (state.activeWindowId === id) return state;
        const maxZ = state.windows.length > 0 ? Math.max(...state.windows.map(w => w.zIndex)) : 0;
        return {
          windows: state.windows.map(w => w.id === id ? { ...w, zIndex: maxZ + 1, isMinimized: false } : w),
          activeWindowId: id
        };
      }),
      minimizeAll: () => set((state) => ({
        windows: state.windows.map((window) => ({ ...window, isMinimized: true, isMaximized: false })),
        activeWindowId: null,
      })),
      openInEditor: (file) => get().openWindow(EDITOR_WINDOW_ID, EDITOR_TITLE, 'code-editor', undefined, file),
      closeAll: () => set({ windows: [], activeWindowId: null }),
    }),
    {
      name: 'mekty.workspace.windows',
      version: 3,
      // Окна восстанавливаются только на клиенте: сервер их не знает, и
      // синхронное восстановление привело бы к расхождению разметки.
      skipHydration: true,
      // Старая версия принудительно показывала все сохранённые окна после
      // каждой навигации. Это возвращало на экран несколько перекрывающих
      // окон, включая развёрнутый терминал. Один раз сворачиваем старый
      // набор; дальше сохраняем фактическое состояние окна.
      migrate: (persistedState, version) => {
        const stored = persistedState as Partial<WorkspaceStore>;
        const windows = Array.isArray(stored.windows) ? stored.windows : [];
        if (version < 3) {
          return {
            windows: windows.map((window) => ({ ...window, isMinimized: true, isMaximized: false })),
            activeWindowId: null,
          };
        }
        return {
          windows,
          activeWindowId: stored.activeWindowId ?? null,
        };
      },
      // Сохраняем только состояние окон, а не функции. Если активное окно
      // свернули, не восстанавливаем фокус на скрытом приложении.
      partialize: (state) => ({
        windows: state.windows,
        activeWindowId: state.windows.some((window) => window.id === state.activeWindowId && !window.isMinimized)
          ? state.activeWindowId
          : null,
      }),
    },
  ),
);
