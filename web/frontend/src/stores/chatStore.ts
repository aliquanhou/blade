/**
 * ⚔️ Chat Store — Zustand state management
 *
 * 支持 llmagent 标准事件：token / tool_use / tool_result / done
 */

import { create } from 'zustand';
import { bladeApi } from '../api/client';
import type { Message, ToolCallInfo } from '../types';

export interface Session {
  id: string;
  title: string;
  created: string;
  updated?: string;
}

interface ChatState {
  messages: Record<string, Message[]>;
  currentSessionId: string;
  sessions: Session[];
  isStreaming: boolean;
  streamingText: string;

  createSession: () => Promise<void>;
  switchSession: (id: string, loadRemote?: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  loadSessions: () => Promise<void>;
  loadSessionMessages: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {
    'default': [{
      id: 'welcome',
      role: 'assistant',
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
    } catch { /* ignore */ }
  },

  createSession: async () => {
    try {
      const session = await bladeApi.createSession();
      set(state => ({
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        messages: {
          ...state.messages,
          [session.id]: [{
            id: 'welcome-' + session.id,
            role: 'assistant',
            content: '新会话已开始。有什么可以帮你的？',
            timestamp: Date.now(),
          }],
        },
      }));
    } catch { /* ignore */ }
  },

  switchSession: async (id: string, loadRemote?: boolean) => {
    const state = get();
    if (loadRemote !== false && !state.messages[id]) {
      // 尝试从服务器加载历史消息
      try {
        const { messages: remoteMsgs } = await bladeApi.getSessionMessages(id);
        if (remoteMsgs && remoteMsgs.length > 0) {
          // 转换服务器消息格式为前端 Message 格式
          const frontendMsgs = remoteMsgs.map((m: any, i: number) => ({
            id: `msg-${id}-${i}`,
            role: m.role || 'assistant',
            content: m.content || '',
            timestamp: Date.now() - (remoteMsgs.length - i) * 1000,
            toolCalls: m.tool_calls?.map((tc: any) => ({
              name: tc.name || '',
              input: tc.arguments || {},
              status: 'completed' as const,
              result: '',
            })),
          }));
          set(state2 => ({
            currentSessionId: id,
            messages: { ...state2.messages, [id]: frontendMsgs },
          }));
          return;
        }
      } catch { /* fall through to welcome */ }
    }
    set(state2 => {
      if (!state2.messages[id]) {
        return {
          currentSessionId: id,
          messages: {
            ...state2.messages,
            [id]: [{
              id: 'welcome-' + id,
              role: 'assistant',
              content: '新会话已开始。有什么可以帮你的？',
              timestamp: Date.now(),
            }],
          },
        };
      }
      return { currentSessionId: id };
    });
  },

  loadSessionMessages: async (id: string) => {
    try {
      const { messages: remoteMsgs } = await bladeApi.getSessionMessages(id);
      if (remoteMsgs && remoteMsgs.length > 0) {
        const frontendMsgs = remoteMsgs.map((m: any, i: number) => ({
          id: `msg-${id}-${i}`,
          role: m.role || 'assistant',
          content: m.content || '',
          timestamp: Date.now() - (remoteMsgs.length - i) * 1000,
          toolCalls: m.tool_calls?.map((tc: any) => ({
            name: tc.name || '',
            input: tc.arguments || {},
            status: 'completed' as const,
            result: '',
          })),
        }));
        set(state => ({
          messages: { ...state.messages, [id]: frontendMsgs },
        }));
      }
    } catch { /* ignore */ }
  },

  deleteSession: async (id: string) => {
    try {
      await bladeApi.deleteSession(id);
      set(state => {
        const { [id]: _, ...rest } = state.messages;
        const newId = state.currentSessionId === id ? 'default' : state.currentSessionId;
        return {
          messages: rest,
          currentSessionId: newId,
          sessions: state.sessions.filter(s => s.id !== id),
        };
      });
    } catch { /* ignore */ }
  },

  sendMessage: async (content: string) => {
    const { currentSessionId } = get();
    const msgId = Date.now().toString();
    const userMsg: Message = {
      id: msgId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    const assistantMsg: Message = {
      id: 'resp-' + msgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
    };

    set(state => ({
      messages: {
        ...state.messages,
        [currentSessionId]: [
          ...(state.messages[currentSessionId] || []),
          userMsg,
          assistantMsg,
        ],
      },
      isStreaming: true,
      streamingText: '',
    }));

    let accumulated = '';
    const currentToolCalls: ToolCallInfo[] = [];

    await bladeApi.chatStream(
      { prompt: content, session_id: currentSessionId },
      {
        onToken: (token) => {
          accumulated += token;
          set(state => {
            const msgs = [...(state.messages[currentSessionId] || [])];
            const last = { ...msgs[msgs.length - 1], content: accumulated, toolCalls: currentToolCalls };
            msgs[msgs.length - 1] = last;
            return {
              messages: { ...state.messages, [currentSessionId]: msgs },
              streamingText: accumulated,
            };
          });
        },
        onToolUse: (name, input) => {
          const toolCall: ToolCallInfo = {
            name,
            input,
            status: 'running',
          };
          currentToolCalls.push(toolCall);
          set(state => {
            const msgs = [...(state.messages[currentSessionId] || [])];
            const last = { ...msgs[msgs.length - 1], toolCalls: [...currentToolCalls] };
            msgs[msgs.length - 1] = last;
            return { messages: { ...state.messages, [currentSessionId]: msgs } };
          });
        },
        onToolResult: (resultContent, name, isError) => {
          // Update the matching tool call status
          const tc = currentToolCalls.find(t => t.name === name && t.status === 'running');
          if (tc) {
            tc.status = isError ? 'failed' : 'completed';
            tc.result = resultContent;
          }
          set(state => {
            const msgs = [...(state.messages[currentSessionId] || [])];
            const last = { ...msgs[msgs.length - 1], toolCalls: [...currentToolCalls] };
            msgs[msgs.length - 1] = last;
            return { messages: { ...state.messages, [currentSessionId]: msgs } };
          });
        },
        onDone: (_completeMessage) => {
          set({
            isStreaming: false,
            streamingText: '',
          });
        },
        onError: (error) => {
          set(state => {
            const msgs = [...(state.messages[currentSessionId] || [])];
            const last = {
              ...msgs[msgs.length - 1],
              content: accumulated || `错误：${error}`,
              toolCalls: currentToolCalls,
            };
            msgs[msgs.length - 1] = last;
            return {
              messages: { ...state.messages, [currentSessionId]: msgs },
              isStreaming: false,
              streamingText: '',
            };
          });
        },
      },
    );
  },

  clearMessages: () => {
    const id = Date.now().toString();
    set(state => ({
      currentSessionId: id,
      messages: {
        ...state.messages,
        [id]: [{
          id: 'welcome-' + id,
          role: 'assistant',
          content: '新会话已开始。有什么可以帮你的？',
          timestamp: Date.now(),
        }],
      },
    }));
  },
}));
