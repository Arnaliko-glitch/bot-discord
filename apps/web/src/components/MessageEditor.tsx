'use client';

import { useState, useRef, useEffect } from 'react';
import { Smile, Hash } from 'lucide-react';
import type { Channel } from './ChannelSelect';

const EMOJIS = [
  '😀', '😄', '😉', '😊', '😍', '😘', '😜', '🤔', '😎', '😢', '😭', '😡',
  '👍', '👎', '👏', '🙌', '🎉', '🔥', '💯', '✨', '❤️', '💜', '⭐', '✅',
  '👋', '🙏', '😴', '🤝', '🚀', '🎮', '🎁', '⚔️',
];

export function MessageEditor({
  label,
  value,
  onChange,
  channels,
  maxLength = 4000,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  channels: Channel[];
  maxLength?: number;
  rows?: number;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
        setChannelOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div ref={wrapperRef}>
      <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>
      <div className="rounded-lg border border-white/10 bg-black/20">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          rows={rows}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-600"
        />
        <div className="flex items-center justify-between border-t border-white/10 px-2 py-1.5">
          <div className="flex items-center gap-1">
            {/* Emoji */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setEmojiOpen((o) => !o);
                  setChannelOpen(false);
                }}
                className="rounded p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                title="Insérer un emoji"
              >
                <Smile size={16} />
              </button>
              {emojiOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-1 grid w-56 grid-cols-8 gap-1 rounded-lg border border-white/10 bg-[#1a1d23] p-2 shadow-xl">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        insertAtCursor(e);
                        setEmojiOpen(false);
                      }}
                      className="rounded p-1 text-base hover:bg-white/10"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lien vers un salon */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setChannelOpen((o) => !o);
                  setEmojiOpen(false);
                }}
                className="flex items-center gap-1 rounded px-1.5 py-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                title="Insérer un lien vers un salon"
              >
                <Hash size={16} />
              </button>
              {channelOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1d23] py-1 shadow-xl">
                  {channels.length === 0 && (
                    <div className="px-2.5 py-1.5 text-sm text-gray-500">Aucun salon</div>
                  )}
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        insertAtCursor(`<#${c.id}>`);
                        setChannelOpen(false);
                      }}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-white/5"
                    >
                      <Hash size={14} className="text-gray-500" />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <span className="pr-1 text-xs text-gray-500">
            {value.length}/{maxLength}
          </span>
        </div>
      </div>
    </div>
  );
}