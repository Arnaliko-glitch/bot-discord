'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Airplane, Flag, Hamburger, Hash, Lightbulb, Plant, SoccerBall, Users, type Icon } from '@phosphor-icons/react';
import { EMOJI_CATEGORIES, type EmojiEntry, type GuildEmoji } from '@/lib/emoji-data';
import { TwemojiSpriteImg } from '@/components/TwemojiSpriteImg';

// Icônes pleines (weight="fill") plutôt qu'en contour — Phosphor Icons
// (licence MIT), pas les icônes exactes de DraftBot.
const CATEGORY_ICONS: Record<string, Icon> = {
  people: Users,
  nature: Plant,
  food: Hamburger,
  activities: SoccerBall,
  travel: Airplane,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag,
};

// Panneau complet (recherche + catégories + grille) — chargé en dynamique
// depuis EmojiPickerButton pour ne pas alourdir le bundle initial avec les
// ~1900 emojis Unicode (voir lib/emoji-data.ts) tant que le picker n'a
// jamais été ouvert. Les émojis du serveur sont déjà chargés par la page
// parente (en même temps que les salons/rôles) et passés en prop : on évite
// ainsi un aller-retour réseau supplémentaire au moment de l'ouverture, qui
// rendait le premier affichage des émojis du serveur très lent.
export default function EmojiPickerPanel({
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
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string>(guildEmojis.length > 0 ? 'guild' : EMOJI_CATEGORIES[0].key);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const normalizedQuery = query.trim().replace(/^:+|:+$/g, '').toLowerCase();

  const filteredGuildEmojis = normalizedQuery
    ? guildEmojis.filter((e) => e.name.toLowerCase().includes(normalizedQuery))
    : guildEmojis;

  const filteredCategories = (
    normalizedQuery
      ? EMOJI_CATEGORIES.map((cat) => ({
          ...cat,
          emojis: cat.emojis.filter((e) => e.name.toLowerCase().includes(normalizedQuery)),
        }))
      : EMOJI_CATEGORIES
  ).filter((cat) => cat.emojis.length > 0);

  const noResults = filteredGuildEmojis.length === 0 && filteredCategories.length === 0;

  // Ordre d'apparition réel des sections, pour savoir laquelle est "active"
  // pendant le défilement.
  const sectionOrder = [
    ...(filteredGuildEmojis.length > 0 ? ['guild'] : []),
    ...filteredCategories.map((c) => c.key),
  ];

  function updateActiveFromScroll() {
    const container = scrollRef.current;
    if (!container) return;
    let current = sectionOrder[0];
    for (const key of sectionOrder) {
      const el = sectionRefs.current[key];
      if (el && el.offsetTop - container.scrollTop <= 4) current = key;
    }
    if (current) setActiveKey(current);
  }

  // Recalcule la section active à chaque changement de résultats (recherche,
  // ou arrivée tardive des émojis du serveur si le panneau s'est monté avant
  // la fin du chargement — sinon activeKey restait figé sur sa valeur
  // initiale et ne "voyait" jamais la section "guild").
  useEffect(() => {
    updateActiveFromScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, guildEmojis]);

  function scrollToSection(key: string) {
    const section = sectionRefs.current[key];
    if (!section || !scrollRef.current) return;
    setActiveKey(key);
    scrollRef.current.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  }

  function pickGuildEmoji(e: GuildEmoji) {
    onPick(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`);
  }

  function pickUnicodeEmoji(e: EmojiEntry) {
    onPick(e.emoji);
  }

  return (
    <div className="flex h-[500px] w-[380px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1d23] shadow-2xl">
      <div className="border-b border-white/10 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un emoji"
            className="w-full rounded-md border border-white/10 bg-[#2b2d31] py-1.5 pl-8 pr-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 py-2">
          {guildEmojis.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('guild')}
              title={guildName}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                activeKey === 'guild' ? 'bg-white/10 ring-2 ring-[var(--accent)]' : 'hover:bg-white/10'
              }`}
            >
              {guildIconUrl ? (
                <img src={guildIconUrl} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                  {guildName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>
          )}
          {EMOJI_CATEGORIES.map((cat) => {
            const active = activeKey === cat.key;
            const CategoryIcon = CATEGORY_ICONS[cat.key];
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => scrollToSection(cat.key)}
                title={cat.label}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                  active ? 'bg-white/10 text-white ring-2 ring-[var(--accent)]' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <CategoryIcon size={20} weight="fill" />
              </button>
            );
          })}
        </div>

        <div
          ref={scrollRef}
          onScroll={updateActiveFromScroll}
          className="thin-scrollbar relative min-h-0 flex-1 overflow-y-auto border-l border-white/10 px-2 pb-2"
        >
          {/* Espaceur "dans le flux" plutôt qu'un padding-top sur le
              conteneur : sinon les en-têtes sticky restent décalés de ce
              padding en permanence au lieu de s'ancrer pile en haut une fois
              qu'on a commencé à défiler. */}
          <div className="h-2" aria-hidden />

          {noResults && <p className="px-1 py-6 text-center text-sm text-gray-500">Aucun résultat</p>}

          {filteredGuildEmojis.length > 0 && (
            <div
              ref={(el) => {
                sectionRefs.current.guild = el;
              }}
            >
              <p className="sticky top-0 z-10 truncate bg-[#1a1d23] px-1 py-1 text-xs font-semibold text-gray-400">
                {guildName}
              </p>
              <div className="grid grid-cols-6 gap-1">
                {filteredGuildEmojis.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    title={e.name}
                    onClick={() => pickGuildEmoji(e)}
                    className="flex h-11 w-11 items-center justify-center rounded transition hover:bg-white/10"
                  >
                    <img
                      src={`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=48`}
                      alt={e.name}
                      width={32}
                      height={32}
                      className="h-8 w-8"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredCategories.map((cat) => (
            <div
              key={cat.key}
              ref={(el) => {
                sectionRefs.current[cat.key] = el;
              }}
            >
              <p className="sticky top-0 z-10 bg-[#1a1d23] px-1 py-1 text-xs font-semibold text-gray-400">{cat.label}</p>
              <div className="grid grid-cols-6 gap-1">
                {cat.emojis.map((e) => (
                  <button
                    key={e.emoji}
                    type="button"
                    title={e.name}
                    onClick={() => pickUnicodeEmoji(e)}
                    className="flex h-11 w-11 items-center justify-center rounded transition hover:bg-white/10"
                  >
                    <TwemojiSpriteImg emoji={e.emoji} size={32} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
