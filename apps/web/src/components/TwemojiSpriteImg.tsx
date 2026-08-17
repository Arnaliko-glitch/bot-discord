'use client';

import spriteMap from '@/lib/emoji-sprite-map.json';
import { TwemojiImg } from '@/components/TwemojiImg';

const CELL = spriteMap.cell;
const positions = spriteMap.positions as Record<string, { x: number; y: number }>;

// Émoji Unicode affiché depuis notre sprite sheet (une seule image, générée
// à partir des mêmes PNG Twemoji — voir apps/web/public/emojis/sprite.png)
// plutôt qu'une requête réseau par émoji : le picker s'ouvre instantanément
// une fois cette image en cache, comme chez DraftBot.
export function TwemojiSpriteImg({ emoji, size = CELL, className }: { emoji: string; size?: number; className?: string }) {
  const pos = positions[emoji];
  // Repli sur l'image individuelle pour un émoji hors de notre sprite (ex:
  // tapé directement dans le texte plutôt que choisi dans le picker).
  if (!pos) return <TwemojiImg emoji={emoji} className={className} />;

  const scale = size / CELL;
  return (
    <span
      role="img"
      aria-label={emoji}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundImage: 'url(/emojis/sprite.png)',
        backgroundPosition: `${-pos.x * scale}px ${-pos.y * scale}px`,
        backgroundSize: `${spriteMap.width * scale}px ${spriteMap.height * scale}px`,
      }}
    />
  );
}
