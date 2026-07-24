import { useState, useEffect } from 'react';
import { bladeApi } from '../api/client';

interface Settings {
  provider: string; model: string; apiKey: string; maxTokens: number; temperature: number;
}

interface Props { onClose: () => void; }

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings>({
    provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: '', maxTokens: 8192, temperature: 0.7,
  });
  const [currentSettings, setCurrentSettings] = useState<any>({});

  useEffect(() => {
    bladeApi.health().then(h => {
      setSettings(s => ({ ...s, provider: h.provider, model: h.model }));
      setCurrentSettings(h);
    });
  }, []);

  const handleSave = async () => {
    await bladeApi.saveSettings({
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold">⚙️ 设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">AI 模型</label>
            <select value={settings.provider} onChange={e => setSettings({...settings, provider: e.target.value})}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm">
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">模型名称</label>
            <input type="text" value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">API 密钥</label>
            <input type="password" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})}
              placeholder={currentSettings.hasApiKey ? '••••••••（已设置）' : '输入 API Key...'}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              温度：{settings.temperature}
            </label>
            <input type="range" min="0" max="2" step="0.1" value={settings.temperature}
              onChange={e => setSettings({...settings, temperature: parseFloat(e.target.value)})}
              className="w-full accent-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 rounded-lg hover:bg-blue-700">保存</button>
        </div>
      </div>
    </div>
  );
}
