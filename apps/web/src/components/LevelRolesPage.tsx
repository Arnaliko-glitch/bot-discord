'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { InputField } from '@/components/ConfigForm';

interface LevelRole {
  id: string;
  level: number;
  roleId: string;
}

export function LevelRolesPage({ guildId, roles }: { guildId: string; roles: LevelRole[] }) {
  const [items, setItems] = useState(roles);
  const [newLevel, setNewLevel] = useState('');
  const [newRole, setNewRole] = useState('');
  const [message, setMessage] = useState('');

  async function save(updated: LevelRole[]) {
    const res = await fetch(`/api/guilds/${guildId}/level-roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: updated.map(({ level, roleId }) => ({ level, roleId })) }),
    });
    setMessage(res.ok ? '✅ Enregistré' : '❌ Erreur');
    if (res.ok) setItems(updated);
  }

  async function add() {
    const level = Number(newLevel);
    if (!level || !newRole) return;
    const updated = [...items, { id: crypto.randomUUID(), level, roleId: newRole }].sort((a, b) => a.level - b.level);
    await save(updated);
    setNewLevel('');
    setNewRole('');
  }

  async function remove(id: string) {
    await save(items.filter((r) => r.id !== id));
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-3">
        {items.length === 0 ? (
          <p className="text-gray-400">Aucun rôle configuré</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
              <span>Niveau <strong>{item.level}</strong> → Rôle <code className="text-[var(--accent)]">{item.roleId}</code></span>
              <button onClick={() => remove(item.id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="card grid grid-cols-2 gap-4">
        <InputField label="Niveau" value={newLevel} onChange={setNewLevel} type="number" />
        <InputField label="ID du rôle" value={newRole} onChange={setNewRole} />
        <button onClick={add} className="btn-primary col-span-2">
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
