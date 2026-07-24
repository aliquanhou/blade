import { useState, useEffect } from 'react';
import { useChat } from './hooks/useChat';
import { bladeApi } from './api/client';
import { FileEditor } from './components/FileEditor';
import { SettingsPanel } from './components/SettingsPanel';
import type { HealthStatus, Tool, FileEntry } from './types';

function App() {
  const { messages, sendMessage, clearMessages, isStreaming } = useChat();
  const [input, setInput] = useState('');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('.');
  const [sidebarTab, setSidebarTab] = useState<'sessions' | 'files' | 'tools'>('sessions');
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [execTool, setExecTool] = useState<string | null>(null);
  const [execParams, setExecParams] = useState<Record<string, string>>({});
  const [execOutput, setExecOutput] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    bladeApi.health().then(setHealth).catch(() => {});
    bladeApi.tools().then(setTools).catch(() => {});
    bladeApi.files().then(d => setFiles(d.entries)).catch(() => {});
    bladeApi.sessions().then(setSessions).catch(() => {});
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

  const handleExecTool = async (name: string) => {
    const result = await bladeApi.executeTool(name, execParams);
    setExecOutput(result.result || JSON.stringify(result));
  };

  const selectedTool = tools.find(t => t.name === execTool);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">⚔️ Blade</span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${health?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
            {health ? `${health.provider} · ${health.model}` : 'connecting...'}
          </span>
        </div>
        <button onClick={() => setShowSettings(true)} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800">⚙️ Settings</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-gray-700 flex flex-col bg-gray-900 shrink-0">
          <div className="flex border-b border-gray-700">
            {(['sessions','files','tools'] as const).map(tab => (
              <button key={tab} onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2 text-xs font-medium ${sidebarTab === tab ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}>
                {tab === 'sessions' ? '💬' : tab === 'files' ? '📂' : '🔧'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {sidebarTab === 'sessions' && (
              <div className="space-y-1">
                <button onClick={clearMessages} className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium">+ New Chat</button>
                {sessions.map((s: any) => (
                  <div key={s.id} className="px-3 py-2 bg-gray-800 rounded-lg mt-2 cursor-pointer text-xs">{s.title}</div>
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
                  <div key={f.path} onClick={() => setEditingFile(f.path)}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800 rounded cursor-pointer">
                    <span>📄</span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-gray-600">{f.size < 1024 ? `${f.size}B` : `${(f.size/1024).toFixed(0)}k`}</span>
                  </div>
                ))}
              </div>
            )}
            {sidebarTab === 'tools' && (
              <div className="space-y-1">
                {tools.map(t => (
                  <div key={t.name} onClick={() => { setExecTool(t.name); setExecOutput(''); setExecParams({}); }}
                    className={`px-2 py-1.5 rounded cursor-pointer ${execTool === t.name ? 'bg-gray-800' : 'hover:bg-gray-800'}`}>
                    <div className="font-medium text-xs">{t.name}</div>
                    <div className="text-xs text-gray-500 truncate">{t.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main area */}
        {editingFile ? (
          <FileEditor path={editingFile} onClose={() => setEditingFile(null)} />
        ) : execTool ? (
          <div className="flex-1 flex flex-col p-4 overflow-auto">
            <h3 className="font-semibold mb-1">{selectedTool?.name}</h3>
            <p className="text-xs text-gray-400 mb-4">{selectedTool?.description}</p>
            <div className="space-y-2 mb-4">
              {['command', 'path', 'pattern', 'query', 'url'].filter(k => !execParams[k] && execParams[k] !== '').slice(0, 2).map(k => (
                <div key={k}>
                  <label className="text-xs text-gray-400 block mb-1">{k}</label>
                  <input value={execParams[k] || ''} onChange={e => setExecParams({...execParams, [k]: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
                </div>
              ))}
              <button onClick={() => handleExecTool(execTool)}
                className="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700">Execute</button>
            </div>
            {execOutput && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Output</div>
                <pre className="p-3 bg-gray-900 border border-gray-700 rounded-lg text-sm overflow-auto max-h-96">{execOutput}</pre>
              </div>
            )}
            <button onClick={() => setExecTool(null)} className="mt-auto text-xs text-gray-500 hover:text-white">← Back to chat</button>
          </div>
        ) : (
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm shrink-0">B</div>
                  )}
                  <div className={`max-w-[75%] ${msg.role === 'user' ? 'bg-blue-600 rounded-2xl rounded-br-sm px-4 py-2' : 'py-1'}`}>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content || (isStreaming ? '▊' : '')}</pre>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-sm shrink-0">U</div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-gray-700 p-4 bg-gray-900">
              <div className="flex gap-2 max-w-4xl mx-auto">
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message..." rows={1}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-blue-500" />
                <button onClick={handleSend} disabled={!input.trim() || isStreaming}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium">
                  {isStreaming ? '⋯' : 'Send'}
                </button>
              </div>
            </div>
          </main>
        )}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
