'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

export interface SelectableEntity {
  id: string;
  name: string;
  color?: string | null;
}

// Sélecteur multiple façon "chips" (rôles/salons) — un bouton "+" ouvre la
// liste des options restantes, chaque choix s'ajoute comme une pastille
// retirable, sans jamais fermer le menu (contrairement à ChannelSelect qui
// ne permet qu'un seul choix à la fois).
export function MultiEntitySelect({
  entities,
  selectedIds,
  onChange,
  placeholder,
  rightSlot,
}: {
  entities: SelectableEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  rightSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = entities.filter((e) => selectedIds.includes(e.id));
  const available = entities.filter((e) => !selectedIds.includes(e.id));

  return (
    <div
      ref={ref}
      onClick={() => setOpen(true)}
      className="input flex cursor-pointer flex-wrap items-center gap-1.5 py-1.5"
    >
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-gray-400 transition hover:border-white/40 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1d23] p-1 shadow-xl"
          >
            {available.length === 0 && <p className="px-2 py-1.5 text-sm text-gray-500">Aucune option</p>}
            {available.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onChange([...selectedIds, e.id])}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
              >
                <span className="truncate" style={e.color ? { color: e.color } : undefined}>
                  {e.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length === 0 && <span className="text-sm text-gray-500">{placeholder}</span>}
      {selected.map((e) => (
        <span key={e.id} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-2.5 pr-1.5 text-xs text-gray-200">
          <span className="truncate" style={e.color ? { color: e.color } : undefined}>
            {e.name}
          </span>
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onChange(selectedIds.filter((id) => id !== e.id));
            }}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {rightSlot && (
        <div onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0 pl-2">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
