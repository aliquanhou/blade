import { create } from 'zustand';
import { bladeApi } from '../api/client';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  created: string;
}

interface ChatState {
  messages: Record<string, Message[]>;
  currentSessionId: string;
  sessions: Session[];
  isStreaming: boolean;
  streamingText: string;

  createSession: () => Promise<void>;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  loadSessions: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {
    'default': [{
      id: 'welcome', role: 'assistant',
      content: '你好！我是 **Blade**，一个轻量级 AI 工程智能体。\n\n我可以帮你：\n- 📁 文件操作\n- 💻 代码生成与分析\n- 🔍 网页搜索与抓取\n- 📊 项目架构分析',
      timestamp: Date.now(),
    }],
  },
  currentSessionId: 'default',
  sessions: [],
  isStreaming: false,
  streamingText: '',

  loadSessions: async () => {
    try {
      const sessions = await bladeApi.sessions();
      set({ sessions });
    } catch {}
  },

  createSession: async () => {
    try {
      const session = await bladeApi.createSession();
      set(state => ({
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        messages: { ...state.messages, [session.id]: [{
          id: 'welcome-' + session.id, role: 'assistant',
          content: '新会话已开始。有什么可以帮你的？',
          timestamp: Date.now(),
        }]},
      }));
    } catch {}
  },

  switchSession: (id: string) => {
    set(state => {
      if (!state.messages[id]) {
        return {
          currentSessionId: id,
          messages: { ...state.messages, [id]: [{
            id: 'welcome-' + id, role: 'assistant',
            content: '新会话已开始。有什么可以帮你的？',
            timestamp: Date.now(),
          }]},
        };
      }
      return { currentSessionId: id };
    });
  },

  deleteSession: async (id: string) => {
    try {
      await bladeApi.deleteSession(id);
      set(state => {
        const { [id]: _, ...rest } = state.messages;
        const newId = state.currentSessionId === id ? 'default' : state.currentSessionId;
        return { messages: rest, currentSessionId: newId, sessions: state.sessions.filter(s => s.id !== id) };
      });
    } catch {}
  },

  sendMessage: async (content: string) => {
    const { currentSessionId } = get();
    const msgId = Date.now().toString();
    const userMsg: Message = { id: msgId, role: 'user', content, timestamp: Date.now() };
    const assistantMsg: Message = { id: 'resp-' + msgId, role: 'assistant', content: '', timestamp: Date.now() };

    set(state => ({
      messages: {
        ...state.messages,
        [currentSessionId]: [...(state.messages[currentSessionId] || []), userMsg, assistantMsg],
      },
      isStreaming: true,
      streamingText: '',
    }));

    let accumulated = '';
    await bladeApi.chatStream(
      { prompt: content },
      (token) => {
        accumulated += token;
        set(state => {
          const msgs = [...(state.messages[currentSessionId] || [])];
          const last = { ...msgs[msgs.length - 1], content: accumulated };
          msgs[msgs.length - 1] = last;
          return { messages: { ...state.messages, [currentSessionId]: msgs }, streamingText: accumulated };
        });
      },
      () => {
        set({ isStreaming: false, streamingText: '' });
      },
      (error) => {
        set(state => {
          const msgs = [...(state.messages[currentSessionId] || [])];
          const last = { ...msgs[msgs.length - 1], content: `错误：${error}` };
          msgs[msgs.length - 1] = last;
          return { messages: { ...state.messages, [currentSessionId]: msgs }, isStreaming: false, streamingText: '' };
        });
      },
    );
  },

  clearMessages: () => {
    const id = Date.now().toString();
    set(state => ({
      currentSessionId: id,
      messages: {
        ...state.messages,
        [id]: [{ id: 'welcome-' + id, role: 'assistant', content: '新会话已开始。有什么可以帮你的？', timestamp: Date.now() }],
      },
    }));
  },
}));
