'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface RoleOption {
  id: string;
  name: string;
  color: string | null;
}

// Un <select> natif ignore le style de l'<option> sélectionnée une fois la
// liste refermée (limitation des navigateurs) — impossible d'afficher la
// couleur du rôle choisi autrement qu'avec un menu déroulant maison, comme
// ChannelSelect.
export function RoleSelect({
  label,
  roles,
  value,
  onChange,
  placeholder = 'Choisir un rôle',
  loading,
  disabled,
}: {
  label: string;
  roles: RoleOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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

  const selected = roles.find((r) => r.id === value);

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
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: selected.color ?? '#80848e' }}
              />
              <span className="truncate" style={selected.color ? { color: selected.color } : undefined}>
                {selected.name}
              </span>
            </>
          ) : (
            <span className="text-gray-500">{loading ? 'Chargement...' : placeholder}</span>
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
          {roles.length === 0 && <p className="px-2 py-1.5 text-sm text-gray-500">Aucun rôle</p>}
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange(r.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition hover:bg-white/10 ${
                r.id === value ? 'bg-white/5' : ''
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? '#80848e' }} />
              <span className="truncate" style={r.color ? { color: r.color } : { color: '#dcddde' }}>
                {r.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
