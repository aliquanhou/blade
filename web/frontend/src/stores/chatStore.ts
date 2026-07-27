/**
 * ⚔️ Chat Store — Zustand state management
 *
 * 支持 llmagent 标准事件：token / tool_use / tool_result / done
 */

import { create } from 'zustand';
import { bladeApi } from '../api/client';
import { useLogStore } from './logStore';
import type { Message, ToolCallInfo } from '../types';

// 将服务器消息转换为前端 Message 格式，同时移除孤儿 tool 消息
function toFrontendMessages(remoteMsgs: any[], sessionId: string): Message[] {
  const result: Message[] = [];
  let pendingToolCalls = 0;
  for (let i = 0; i < remoteMsgs.length; i++) {
    const m = remoteMsgs[i];
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      pendingToolCalls = m.tool_calls.length;
      result.push({
        id: `msg-${sessionId}-${i}`,
        role: 'assistant',
        content: m.content || '',
        timestamp: Date.now() - (remoteMsgs.length - i) * 1000,
        toolCalls: m.tool_calls.map((tc: any) => ({
          name: tc.name || tc.function?.name || '',
          input: tc.arguments || tc.function?.arguments || {},
          status: 'completed' as const,
          result: '',
        })),
      });
    } else if (m.role === 'tool') {
      if (pendingToolCalls > 0) {
        pendingToolCalls--;
        // tool 结果更新到最后一个 tool call 的 result
        if (result.length > 0) {
          const last = result[result.length - 1];
          const target = last.toolCalls?.find(tc => tc.status === 'completed' && !tc.result);
          if (target) target.result = (m.content || '').slice(0, 500);
        }
      } // else: 孤儿 tool 消息，丢弃
    } else if (m.role === 'user') {
      result.push({
        id: `msg-${sessionId}-${i}`,
        role: 'user',
        content: m.content || '',
        timestamp: Date.now() - (remoteMsgs.length - i) * 1000,
      });
    } else if (m.role === 'assistant') {
      result.push({
        id: `msg-${sessionId}-${i}`,
        role: 'assistant',
        content: m.content || '',
        timestamp: Date.now() - (remoteMsgs.length - i) * 1000,
      });
    } // system 等角色跳过
  }
  return result;
}

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
  stopReason: string | null;

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
  stopReason: null,

  loadSessions: async () => {
    try {
      const sessions = await bladeApi.sessions();
      set({ sessions });

      // 恢复持久化的最新会话内容
      if (sessions && sessions.length > 0) {
        const latest = sessions[0];
        try {
          const { messages: remoteMsgs } = await bladeApi.getSessionMessages(latest.id);
          if (remoteMsgs && remoteMsgs.length > 0) {
            const frontendMsgs = toFrontendMessages(remoteMsgs, latest.id);
            set({ currentSessionId: latest.id, messages: { [latest.id]: frontendMsgs } });
            return;
          }
        } catch { /* fall through */ }
      }

      // 没有持久化会话，尝试恢复 default
      try {
        const { messages: defaultMsgs } = await bladeApi.getSessionMessages('default');
        if (defaultMsgs && defaultMsgs.length > 0) {
          const frontendMsgs = toFrontendMessages(defaultMsgs, 'default');
          set({ currentSessionId: 'default', messages: { default: frontendMsgs } });
          return;
        }
      } catch { /* fall through */ }
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
          // 转换服务器消息格式为前端 Message 格式（自动消毒孤儿 tool 消息）
          const frontendMsgs = toFrontendMessages(remoteMsgs, id);
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
        const frontendMsgs = toFrontendMessages(remoteMsgs, id);
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
      stopReason: null,
    }));

    let accumulated = '';
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    const currentToolCalls: ToolCallInfo[] = [];
    const streamStart = Date.now();
    const log = useLogStore.getState().addLog;

    log('api', `Chat stream start: "${content.slice(0, 60)}..."`);

    await bladeApi.chatStream(
      { prompt: content, session_id: currentSessionId },
      {
        onToken: (token) => {
          accumulated += token;
          // 批量更新：每 ~50ms 刷新一次 UI，减少 React 协调压力
          if (!batchTimer) {
            batchTimer = setTimeout(() => {
              batchTimer = null;
              set(state => {
                const msgs = [...(state.messages[currentSessionId] || [])];
                const last = { ...msgs[msgs.length - 1], content: accumulated, toolCalls: currentToolCalls };
                msgs[msgs.length - 1] = last;
                return {
                  messages: { ...state.messages, [currentSessionId]: msgs },
                  streamingText: accumulated,
                };
              });
            }, 50);
          }
        },
        onToolUse: (name, input) => {
          log('tool', `Tool use: ${name}`, JSON.stringify(input));
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
          log('tool', `Tool result: ${name} [${isError ? 'FAIL' : 'OK'}]`, (resultContent || '').slice(0, 200));
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
        onDone: (_completeMessage, stop_reason) => {
          if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
          set(state => {
            const msgs = [...(state.messages[currentSessionId] || [])];
            const last = { ...msgs[msgs.length - 1], content: accumulated, toolCalls: currentToolCalls };
            msgs[msgs.length - 1] = last;
            return {
              messages: { ...state.messages, [currentSessionId]: msgs },
              isStreaming: false,
              streamingText: '',
              stopReason: stop_reason || null,
            };
          });
        },
        onError: (error) => {
          if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
          log('error', `Stream error: ${error}`, undefined, Date.now() - streamStart);
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
              stopReason: 'error',
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
