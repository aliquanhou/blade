export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Tool {
  name: string;
  description: string;
  category: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  provider: string;
  model: string;
}

export interface ChatRequest {
  prompt: string;
  system_prompt?: string;
}

export interface SSEEvent {
  type: 'start' | 'token' | 'done' | 'error';
  text?: string;
  error?: string;
}
