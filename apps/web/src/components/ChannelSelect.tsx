'use client';

import { useState, useRef, useEffect } from 'react';
import { Hash, ChevronDown, X } from 'lucide-react';

export interface Channel {
  id: string;
  name: string;
}

export function ChannelSelect({
  label,
  channels,
  value,
  onChange,
  loading,
}: {
  label: string;
  channels: Channel[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = channels.find((c) => c.id === value);
  const filtered = channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={loading}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-gray-200 hover:border-white/20 disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5 truncate">
            {loading ? (
              <span className="text-gray-500">Chargement des salons...</span>
            ) : selected ? (
              <>
                <Hash size={14} className="text-gray-500" />
                {selected.name}
              </>
            ) : (
              <span className="text-gray-500">Choisir un salon</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {selected && (
              <X
                size={14}
                className="text-gray-500 hover:text-gray-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
              />
            )}
            <ChevronDown size={14} className="text-gray-500" />
          </span>
        </button>

        {open && !loading && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-[#1a1d23] shadow-xl">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un salon..."
              className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-gray-200 outline-none"
            />
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">Aucun salon trouvé</div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5"
                >
                  <Hash size={14} className="text-gray-500" />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}