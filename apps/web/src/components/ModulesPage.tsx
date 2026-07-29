'use client';

import { useState } from 'react';
import { MODULE_LABELS, type BotModule } from '@discord-bot-dashboard/shared';

interface ModuleItem {
  module: string;
  enabled: boolean;
}

export function ModulesPage({ guildId, modules }: { guildId: string; modules: ModuleItem[] }) {
  const [items, setItems] = useState(modules);
  const [message, setMessage] = useState('');

  async function toggle(module: string, enabled: boolean) {
    const res = await fetch(`/api/guilds/${guildId}/modules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, enabled }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((m) => (m.module === module ? { ...m, enabled } : m)));
      setMessage('✅ Module mis à jour');
    } else {
      setMessage('❌ Erreur');
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      {items.map((item) => (
        <label key={item.module} className="card flex cursor-pointer items-center justify-between">
          <div>
            <p className="font-medium">{MODULE_LABELS[item.module as BotModule] ?? item.module}</p>
            <p className="text-sm text-gray-400">{item.module}</p>
          </div>
          <button
            type="button"
            onClick={() => toggle(item.module, !item.enabled)}
            className={`relative h-6 w-11 rounded-full transition ${item.enabled ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${item.enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </label>
      ))}
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
