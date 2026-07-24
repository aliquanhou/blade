import { create } from 'zustand';

export interface ToolState {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  elapsed: number;
  result?: string;
  error?: string;
}

interface ToolStore {
  tools: Record<string, ToolState>;
  setRunning: (name: string) => void;
  setCompleted: (name: string, result: string) => void;
  setFailed: (name: string, error: string) => void;
  resetAll: () => void;
}

export const useToolStore = create<ToolStore>((set) => ({
  tools: {},
  setRunning: (name) => set((state) => ({
    tools: { ...state.tools, [name]: { name, status: 'running', progress: 0, elapsed: 0 } }
  })),
  setCompleted: (name, result) => set((state) => ({
    tools: { ...state.tools, [name]: { ...state.tools[name], status: 'completed', progress: 100, result } }
  })),
  setFailed: (name, error) => set((state) => ({
    tools: { ...state.tools, [name]: { ...state.tools[name], status: 'failed', error } }
  })),
  resetAll: () => set({ tools: {} }),
}));
