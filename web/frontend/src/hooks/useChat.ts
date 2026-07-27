import { useState, useCallback } from 'react';
import { bladeApi } from '../api/client';
import type { Message } from '../types';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'assistant', content: '你好！我是 **Blade**，一个轻量级 AI 工程智能体。\n\n我可以帮你：\n- 📁 文件操作\n- 💻 代码生成与分析\n- 🔍 网页搜索与抓取\n- 📊 项目架构分析', timestamp: Date.now(),
  }]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: Date.now() };
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: Date.now() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    let accumulated = '';
    await bladeApi.chatStream(
      { prompt: content },
      {
        onToken: (token: string) => {
          accumulated += token;
          setMessages(prev => {
            const rest = prev.slice(0, -1);
            return [...rest, { ...assistantMsg, content: accumulated }];
          });
        },
        onToolUse: () => { /* not used in this hook */ },
        onToolResult: () => { /* not used in this hook */ },
        onDone: () => {
          setIsStreaming(false);
        },
        onError: (error: string) => {
          setMessages(prev => {
            const rest = prev.slice(0, -1);
            return [...rest, { ...assistantMsg, content: `Error: ${error}` }];
          });
          setIsStreaming(false);
        },
      },
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([{ id: '0', role: 'assistant', content: '新会话已开始。有什么可以帮你的？', timestamp: Date.now() }]);
  }, []);

  return { messages, sendMessage, clearMessages, isStreaming };
}
