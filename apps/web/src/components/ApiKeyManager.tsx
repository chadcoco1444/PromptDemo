'use client';

import { useState } from 'react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Props {
  initialKeys: ApiKey[];
}

export function ApiKeyManager({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/users/me/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() || 'My API Key' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Failed to create key');
        return;
      }
      setNewRawKey(data.rawKey);
      setKeys((prev) => [
        { id: data.id, name: data.name, keyPrefix: data.keyPrefix, lastUsedAt: null, createdAt: data.createdAt },
        ...prev,
      ]);
      setNameInput('');
    } catch {
      setError('Network error — try again.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any code using it will stop working immediately.')) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/users/me/api-keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        if (newRawKey && keys.find((k) => k.id === id)) setNewRawKey(null);
      }
    } finally {
      setRevoking(null);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* New key banner — shown once after creation */}
      {newRawKey && (
        <div className="rounded-xl ring-1 ring-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-300">
            Copy your API key now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-emerald-200 bg-black/30 rounded-lg px-3 py-2 truncate">
              {newRawKey}
            </code>
            <button
              onClick={() => copy(newRawKey)}
              className="shrink-0 text-xs rounded-lg ring-1 ring-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 px-3 py-2 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewRawKey(null)}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Key name (optional)"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          maxLength={80}
          className="flex-1 rounded-lg ring-1 ring-white/10 bg-white/[0.04] text-sm text-white placeholder-gray-600 px-3 py-2 focus:outline-none focus:ring-brand-500/60"
          onKeyDown={(e) => e.key === 'Enter' && !creating && create()}
        />
        <button
          onClick={create}
          disabled={creating || keys.length >= 5}
          className="shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {creating ? 'Creating…' : '+ New key'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {keys.length >= 5 && <p className="text-xs text-amber-400">Maximum 5 keys reached. Revoke one to create another.</p>}

      {/* Key list */}
      {keys.length === 0 ? (
        <p className="text-sm text-gray-500">No API keys yet. Create one above to get started.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {keys.map((k) => (
            <li key={k.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{k.name}</span>
                  <code className="text-xs font-mono text-gray-500">{k.keyPrefix}…</code>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => revoke(k.id)}
                disabled={revoking === k.id}
                className="shrink-0 text-xs rounded-lg ring-1 ring-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 px-3 py-1.5 transition-colors"
              >
                {revoking === k.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
