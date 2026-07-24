import { useState, useEffect } from 'react';
import { bladeApi } from '../api/client';

interface Props { path: string; onClose: () => void; }

const EXT_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  html: 'html', css: 'css', json: 'json', yml: 'yaml', yaml: 'yaml',
  md: 'markdown', sql: 'sql', sh: 'bash', ps1: 'powershell',
};

export function FileEditor({ path, onClose }: Props) {
  const [content, setContent] = useState('');
  const [origContent, setOrigContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const ext = path.split('.').pop() || '';
  const lang = EXT_MAP[ext] || 'plaintext';

  useEffect(() => {
    setLoading(true);
    bladeApi.readFile(path).then(r => {
      setContent(r.content);
      setOrigContent(r.content);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [path]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await bladeApi.saveFile(path, content);
      setOrigContent(content);
      setIsEditing(false);
    } catch (e) { alert('Save failed'); }
    setSaving(false);
  };

  const handleCancel = () => { setContent(origContent); setIsEditing(false); };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{lang}</span>
          <span className="text-sm font-mono text-gray-300">{path}</span>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded">{saving ? '...' : 'Save'}</button>
              <button onClick={handleCancel}
                className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded">Cancel</button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded">Edit</button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-0">
        {isEditing ? (
          <textarea value={content} onChange={e => setContent(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm bg-gray-950 text-gray-100 border-0 resize-none outline-none" />
        ) : (
          <pre className="p-4 font-mono text-sm text-gray-100 leading-relaxed"><code>{content}</code></pre>
        )}
      </div>
    </div>
  );
}
