'use client';

import { useEffect, useRef, useState } from 'react';
import { AtSign, Hash } from 'lucide-react';
import { parse as parseTwemoji } from 'twemoji-parser';
import { TwemojiSpriteImg } from '@/components/TwemojiSpriteImg';

export interface RoleOption {
  id: string;
  name: string;
  color: string | null;
}

export interface ChannelOption {
  id: string;
  name: string;
}

interface Trigger {
  type: '@' | '#';
  start: number;
  query: string;
}

// Cherche le dernier "@" ou "#" avant le curseur : peu importe ce qui le
// précède (début de ligne, ponctuation, texte...), tant qu'aucun espace n'a
// été tapé depuis, on considère qu'on est en train de choisir un rôle/salon.
function detectTrigger(text: string, cursor: number): Trigger | null {
  const upToCursor = text.slice(0, cursor);
  const lastAt = upToCursor.lastIndexOf('@');
  const lastHash = upToCursor.lastIndexOf('#');
  const start = Math.max(lastAt, lastHash);
  if (start === -1) return null;
  const query = upToCursor.slice(start + 1);
  if (/\s/.test(query)) return null;
  return { type: upToCursor[start] as '@' | '#', start, query };
}

// Textarea avec autocomplétion "@" (rôles) et "#" (salons) façon Discord —
// insère le vrai tag de mention (<@&id> / <#id>) que Discord résout tout
// seul à l'affichage, aucun traitement supplémentaire nécessaire côté bot.
export function MentionTextarea({
  value,
  onChange,
  roles,
  channels,
  rows = 4,
  maxLength,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: RoleOption[];
  channels: ChannelOption[];
  rows?: number;
  maxLength?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-agrandit la zone de texte à chaque retour à la ligne, comme une
  // vraie zone de saisie Discord, au lieu de rester figée à `rows`.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const options: Array<RoleOption | ChannelOption> = trigger
    ? (trigger.type === '@' ? roles : channels)
        .filter((o) => o.name.toLowerCase().includes(trigger.query.toLowerCase()))
        .slice(0, 8)
    : [];

  function syncTrigger(text: string, cursor: number) {
    setTrigger(detectTrigger(text, cursor));
    setActiveIndex(0);
  }

  function pick(option: RoleOption | ChannelOption) {
    if (!trigger) return;
    const tag = trigger.type === '@' ? `<@&${option.id}>` : `<#${option.id}>`;
    const before = value.slice(0, trigger.start);
    const after = value.slice(trigger.start + 1 + trigger.query.length);
    const next = `${before}${tag} ${after}`;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setTrigger(null);
    const pos = before.length + tag.length + 1;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          const text = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
          onChange(text);
          syncTrigger(text, e.target.selectionStart ?? text.length);
        }}
        onKeyDown={(e) => {
          if (trigger && options.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % options.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + options.length) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(options[activeIndex]);
              return;
            }
            if (e.key === 'Escape') {
              setTrigger(null);
              return;
            }
          }
        }}
        onClick={(e) => syncTrigger(value, e.currentTarget.selectionStart ?? 0)}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            syncTrigger(value, e.currentTarget.selectionStart ?? 0);
          }
        }}
        onBlur={() => setTimeout(() => setTrigger(null), 150)}
        rows={rows}
        placeholder={placeholder}
        className={className}
        style={{ overflow: 'hidden' }}
      />
      {trigger && options.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#1a1d23] py-1 shadow-xl">
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-sm transition ${
                i === activeIndex ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              {trigger.type === '@' ? (
                <AtSign className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              ) : (
                <Hash className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              )}
              <span
                className="truncate"
                style={trigger.type === '@' && (o as RoleOption).color ? { color: (o as RoleOption).color! } : undefined}
              >
                {o.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Rend un texte contenant des tags <@&roleId> / <#channelId> / <a?:nom:id>
// (emoji personnalisé) avec des pastilles/images façon Discord — utilisé
// dans les aperçus pour montrer ce que verrait vraiment un membre (au lieu
// du tag brut).
export function renderMentionText(text: string, roles: RoleOption[], channels: ChannelOption[]) {
  const parts = text.split(/(<@&\d+>|<#\d+>|<a?:\w+:\d+>)/g);
  return parts.map((part, i) => {
    const roleMatch = /^<@&(\d+)>$/.exec(part);
    if (roleMatch) {
      const role = roles.find((r) => r.id === roleMatch[1]);
      return (
        <span key={i} className="rounded bg-[#5865F2]/30 px-1 font-medium text-[#c9cdfb]">
          @{role?.name ?? 'rôle-inconnu'}
        </span>
      );
    }
    const channelMatch = /^<#(\d+)>$/.exec(part);
    if (channelMatch) {
      const channel = channels.find((c) => c.id === channelMatch[1]);
      return (
        <span key={i} className="rounded bg-[#5865F2]/30 px-1 font-medium text-[#c9cdfb]">
          #{channel?.name ?? 'salon-inconnu'}
        </span>
      );
    }
    const emojiMatch = /^<(a?):(\w+):(\d+)>$/.exec(part);
    if (emojiMatch) {
      const [, animated, name, id] = emojiMatch;
      return (
        <img
          key={i}
          src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`}
          alt={name}
          title={name}
          className="inline-block h-[1.375em] w-[1.375em] -translate-y-[3px] align-middle"
        />
      );
    }
    return renderPlainTextEmoji(part, i);
  });
}

// Remplace les émojis Unicode bruts d'un morceau de texte par leur image
// Twemoji (même rendu que Discord) — sinon un émoji trop récent pour la
// police système de l'utilisateur s'affiche en carré gris ("tofu") dans
// l'aperçu, alors qu'il s'affichera correctement une fois envoyé sur
// Discord (qui utilise aussi Twemoji).
function renderPlainTextEmoji(text: string, keyPrefix: number) {
  const matches = parseTwemoji(text);
  if (matches.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, j) => {
    const [start, end] = m.indices;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <TwemojiSpriteImg
        key={`${keyPrefix}-emoji-${j}`}
        emoji={m.text}
        size={20}
        className="inline-block -translate-y-[2px] align-middle"
      />
    );
    cursor = end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
