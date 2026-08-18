'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Hash, X } from 'lucide-react';

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
  disabled,
}: {
  label: string;
  channels: Channel[];
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
  disabled?: boolean;
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

  const selected = channels.find((c) => c.id === value);

  return (
    <div ref={ref} className="relative">
      {label && <span className="label">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading || disabled}
        className="input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {selected ? (
            <>
              <Hash className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-gray-500">{loading ? 'Chargement...' : 'Choisir un salon'}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#1a1d23] p-1 shadow-xl">
          {channels.length === 0 && <p className="px-2 py-1.5 text-sm text-gray-500">Aucun salon</p>}
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition hover:bg-white/10 ${
                c.id === value ? 'text-[var(--accent)]' : 'text-gray-300'
              }`}
            >
              <Hash className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
