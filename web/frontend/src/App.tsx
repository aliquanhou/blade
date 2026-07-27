import { useEffect, useRef, useState } from 'react';
import { useChatStore } from './stores/chatStore';
import { useToolStore } from './stores/toolStore';
import { MessageItem } from './components/chat/MessageItem';
import { bladeApi } from './api/client';
import type { HealthStatus, Tool, FileEntry } from './types';

function App() {
  const { messages, currentSessionId, isStreaming, sendMessage, createSession, switchSession, deleteSession, loadSessions, sessions, clearMessages } = useChatStore();
  const [input, setInput] = useState('');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('.');
  const [sidebarTab, setSidebarTab] = useState<'sessions' | 'files' | 'tools'>('sessions');
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState('deepseek');
  const [settingsModel, setSettingsModel] = useState('deepseek-v4-flash');
  const [settingsApiKey, setSettingsApiKey] = useState('');

  const chatRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentMessages = messages[currentSessionId] || [];

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, isStreaming]);

  useEffect(() => {
    bladeApi.health().then(setHealth).catch(() => {});
    bladeApi.tools().then(setTools).catch(() => {});
    bladeApi.files().then(d => setFiles(d.entries)).catch(() => {});
    loadSessions();
  }, []);

  const navigateDir = async (path: string) => {
    setCurrentPath(path);
    const d = await bladeApi.files(path);
    setFiles(d.entries);
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleSaveSettings = async () => {
    await bladeApi.saveSettings({ provider: settingsProvider, model: settingsModel, apiKey: settingsApiKey || undefined });
    setShowSettings(false);
    bladeApi.health().then(setHealth);
  };

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop();
    if (['ts','tsx','js','jsx'].includes(ext || '')) return '🟦';
    if (['py','rs','go','java'].includes(ext || '')) return '🟩';
    if (['md','txt'].includes(ext || '')) return '📄';
    if (['json','yml','yaml','toml'].includes(ext || '')) return '📋';
    if (['png','jpg','svg','ico'].includes(ext || '')) return '🖼️';
    return '📄';
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="text-gray-400 hover:text-white text-lg">{sidebarCollapsed ? '☰' : '◁'}</button>
          <span className="text-lg font-bold">⚔️ Blade</span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${health?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
            {health ? `${health.provider} · ${health.model}` : '连接中...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(true)} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800">⚙️</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-60 border-r border-gray-700 flex flex-col bg-gray-900 shrink-0">
            <div className="flex border-b border-gray-700">
              {(['sessions','files','tools'] as const).map(tab => (
                <button key={tab} onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium ${sidebarTab === tab ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
                >{tab === 'sessions' ? '💬' : tab === 'files' ? '📂' : '🔧'}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 text-sm">
              {sidebarTab === 'sessions' && (
                <div className="space-y-1">
                  <button onClick={() => { clearMessages(); createSession(); }} className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium">+ 新会话</button>
                  <div onClick={() => switchSession('default')} className={`mt-2 px-3 py-2 rounded-lg cursor-pointer text-xs ${currentSessionId === 'default' ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>默认会话</div>
                  {sessions.map(s => (
                    <div key={s.id} onClick={() => switchSession(s.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs ${currentSessionId === s.id ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                      <span className="truncate">{s.title}</span>
                      <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }} className="text-gray-500 hover:text-red-400 ml-1">×</button>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === 'files' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">{currentPath === '.' ? '/' : currentPath}</span>
                    {currentPath !== '.' && <button onClick={() => navigateDir('.')} className="text-xs text-blue-400">↑</button>}
                  </div>
                  {files.filter(f => f.is_dir).map(f => (
                    <div key={f.path} onClick={() => navigateDir(f.path)}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer">
                      <span>📁</span><span className="truncate">{f.name}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-700 my-1" />
                  {files.filter(f => !f.is_dir).map(f => (
                    <div key={f.path} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer">
                      <span>{fileIcon(f.name)}</span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-gray-600">{f.size < 1024 ? `${f.size}B` : `${(f.size/1024).toFixed(0)}k`}</span>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === 'tools' && (
                <div className="space-y-1">
                  {['file', 'code', 'shell', 'web', 'git', 'system'].map(cat => {
                    const catTools = tools.filter(t => t.category === cat);
                    if (!catTools.length) return null;
                    return (
                      <div key={cat} className="mb-3">
                        <div className="text-[10px] uppercase text-gray-500 font-semibold px-2 mb-1">
                          {cat === 'file' ? '📁 文件' : cat === 'code' ? '💻 代码' : cat === 'shell' ? '⚡ Shell' : cat === 'web' ? '🌐 Web' : cat === 'git' ? '📊 Git' : '📈 系统'}
                        </div>
                        {catTools.map(t => {
                          const st = useToolStore.getState().tools[t.name];
                          const status = st?.status || 'idle';
                          const statusIcon = status === 'running' ? '◉' : status === 'completed' ? '✅' : status === 'failed' ? '❌' : '●';
                          const statusColor = status === 'running' ? 'text-blue-400 animate-pulse' : status === 'completed' ? 'text-green-400' : status === 'failed' ? 'text-red-400' : 'text-gray-500';
                          return (
                            <div key={t.name} className={`flex items-center gap-2 px-2 py-1 rounded ${status === 'running' ? 'bg-blue-900/30' : 'hover:bg-gray-800'}`}>
                              <span className={`text-xs ${statusColor}`}>{statusIcon}</span>
                              <span className="text-xs flex-1 truncate">{t.name}</span>
                              {status === 'running' && <span className="text-[10px] text-blue-400">⏳</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  <div className="border-t border-gray-700 mt-2 pt-2">
                    <div className="text-[10px] text-gray-500 px-2">共 {tools.length} 个工具</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main chat */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentMessages.map(msg => (
              <MessageItem key={msg.id} message={msg} isStreaming={isStreaming && msg.id === currentMessages[currentMessages.length-1]?.id && msg.role === 'assistant'} />
            ))}
            {isStreaming && currentMessages.length > 0 && !currentMessages[currentMessages.length-1]?.content && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm shrink-0">B</div>
                <div className="py-1 text-sm text-gray-400"><span className="typing-cursor">思考中</span></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-gray-700 p-4 bg-gray-900">
            <div className="flex gap-2 max-w-4xl mx-auto">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="输入消息..." rows={1}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-blue-500 transition-colors" />
              <button onClick={handleSend} disabled={!input.trim() || isStreaming}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors">
                {isStreaming ? '⋯' : '发送'}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Settings dialog */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <h2 className="text-lg font-semibold">⚙️ 设置</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">AI 模型</label>
                <select value={settingsProvider} onChange={e => setSettingsProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm">
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama（本地）</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">模型名称</label>
                <input type="text" value={settingsModel} onChange={e => setSettingsModel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">API 密钥</label>
                <input type="password" value={settingsApiKey} onChange={e => setSettingsApiKey(e.target.value)}
                  placeholder={health?.status === 'healthy' ? '✓ 已配置' : '输入 API Key...'}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800">取消</button>
              <button onClick={handleSaveSettings} className="px-4 py-2 text-sm bg-blue-600 rounded-lg hover:bg-blue-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
