import { useState, useRef, useCallback } from 'react';
import { bladeApi } from '../api/client';
import type { Message } from '../types';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'assistant', content: 'Hello! I\'m Blade, ready to help. What are you working on?', timestamp: Date.now(),
  }]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: Date.now() };
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: Date.now() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    let accumulated = '';
    await bladeApi.chatStream(
      { prompt: content },
      (token) => {
        accumulated += token;
        setMessages(prev => {
          const rest = prev.slice(0, -1);
          return [...rest, { ...assistantMsg, content: accumulated }];
        });
      },
      () => {
        setIsStreaming(false);
      },
      (error) => {
        setMessages(prev => {
          const rest = prev.slice(0, -1);
          return [...rest, { ...assistantMsg, content: `Error: ${error}` }];
        });
        setIsStreaming(false);
      },
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([{ id: '0', role: 'assistant', content: 'New session started. How can I help?', timestamp: Date.now() }]);
  }, []);

  return { messages, sendMessage, clearMessages, isStreaming };
}
