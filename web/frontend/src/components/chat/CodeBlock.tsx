import { useState } from 'react';

interface Props { code: string; language?: string; }

export function CodeBlock({ code, language = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400">{language || 'code'}</span>
        <button onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-gray-700 transition-colors">
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-gray-900"><code>{code}</code></pre>
    </div>
  );
}
