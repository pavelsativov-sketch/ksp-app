import { create } from 'zustand';

export type AppType = 'browser' | 'terminal' | 'file-manager' | 'agent-log' | 'iframe' | 'ksp-builder' | 'analytics';

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
}

interface WorkspaceStore {
  windows: WindowState[];
  activeWindowId: string | null;
  openWindow: (id: string, title: string, type: AppType, url?: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  windows: [],
  activeWindowId: null,
  openWindow: (id, title, type, url) => set((state) => {
    const existing = state.windows.find(w => w.id === id);
    if (existing) {
      const maxZ = state.windows.length > 0 ? Math.max(...state.windows.map(w => w.zIndex)) : 0;
      return {
        windows: state.windows.map(w => 
          w.id === id ? { ...w, isMinimized: false, zIndex: maxZ + 1 } : w
        ),
        activeWindowId: id
      };
    }
    const maxZ = state.windows.length > 0 ? Math.max(...state.windows.map(w => w.zIndex)) : 0;
    return {
      windows: [...state.windows, {
        id, title, type, url, isOpen: true, isMinimized: false, isMaximized: false, zIndex: maxZ + 1
      }],
      activeWindowId: id
    };
  }),
  closeWindow: (id) => set((state) => ({
    windows: state.windows.filter(w => w.id !== id),
    activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
  })),
  minimizeWindow: (id) => set((state) => ({
    windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: true } : w),
    activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
  })),
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
  })
}));