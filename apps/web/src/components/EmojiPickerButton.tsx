'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Smile } from 'lucide-react';
import type { GuildEmoji } from '@/lib/emoji-data';

// Chargé à la demande seulement (~1900 emojis Unicode + leurs images) — pas
// besoin d'alourdir le chargement initial de la page pour un panneau que
// l'utilisateur n'ouvre pas forcément.
const EmojiPickerPanel = dynamic(() => import('./EmojiPickerPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-[380px] items-center justify-center rounded-xl border border-white/10 bg-[#1a1d23] text-sm text-gray-500 shadow-2xl">
      Chargement...
    </div>
  ),
});

export function EmojiPickerButton({
  guildName,
  guildIconUrl,
  guildEmojis,
  onPick,
}: {
  guildName: string;
  guildIconUrl: string | null;
  guildEmojis: GuildEmoji[];
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Précharge le code du panneau dès le montage de la page plutôt qu'au
  // premier clic — sinon ce premier clic déclenche le téléchargement du
  // chunk (~1900 emojis Unicode) et se sent lent.
  useEffect(() => {
    import('./EmojiPickerPanel');
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-gray-500 hover:text-gray-300">
        <Smile className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1">
          <EmojiPickerPanel
            guildName={guildName}
            guildIconUrl={guildIconUrl}
            guildEmojis={guildEmojis}
            onPick={(text) => {
              onPick(text);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
