'use client';

import { twemojiFallbackUrl, twemojiUrl } from '@/lib/emoji-data';

// <img> Twemoji avec repli automatique si le nom de fichier exact 404 sur le
// CDN (voir twemojiFallbackUrl) — évite d'afficher une icône d'image cassée.
export function TwemojiImg({ emoji, className, loading }: { emoji: string; className?: string; loading?: 'lazy' | 'eager' }) {
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={emoji}
      loading={loading}
      className={className}
      onError={(e) => {
        const fallback = twemojiFallbackUrl(emoji);
        if (fallback && e.currentTarget.src !== fallback) {
          e.currentTarget.src = fallback;
        }
      }}
    />
  );
}
