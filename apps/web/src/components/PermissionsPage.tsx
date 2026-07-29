'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { InputField } from '@/components/ConfigForm';

interface Permission {
  id: string;
  discordId: string;
  username: string;
  level: string;
}

export function PermissionsPage({ guildId, permissions }: { guildId: string; permissions: Permission[] }) {
  const [items, setItems] = useState(permissions);
  const [discordId, setDiscordId] = useState('');
  const [username, setUsername] = useState('');
  const [level, setLevel] = useState('admin');
  const [message, setMessage] = useState('');

  async function add() {
    if (!discordId || !username) return;
    const res = await fetch(`/api/guilds/${guildId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId, username, level }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => [...prev, data]);
      setDiscordId('');
      setUsername('');
      setMessage('✅ Permission ajoutée');
    } else {
      setMessage('❌ Erreur');
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/guilds/${guildId}/permissions?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems((prev) => prev.filter((p) => p.id !== id));
      setMessage('✅ Permission supprimée');
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-400">
        Le propriétaire du serveur a toujours accès. Ajoutez des administrateurs dashboard ici.
      </p>
      <div className="card space-y-3">
        {items.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
            <div>
              <p className="font-medium">{p.username}</p>
              <p className="text-xs text-gray-500">{p.discordId} · {p.level}</p>
            </div>
            <button onClick={() => remove(p.id)} className="text-red-400 hover:text-red-300">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="card grid gap-4">
        <InputField label="ID Discord" value={discordId} onChange={setDiscordId} />
        <InputField label="Nom d'utilisateur" value={username} onChange={setUsername} />
        <div>
          <label className="label">Niveau</label>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="moderator">Modérateur</option>
          </select>
        </div>
        <button onClick={add} className="btn-primary"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
