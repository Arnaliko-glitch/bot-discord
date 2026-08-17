'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, renderMentionText, type RoleOption } from '@/components/MentionTextarea';
import { MultiEntitySelect } from '@/components/MultiEntitySelect';
import type { GuildEmoji } from '@/lib/emoji-data';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';
import { XpCurveChart } from '@/components/XpCurveChart';

// Couleur fixe de l'embed de niveau — contrairement au module Bienvenue, ce
// visuel n'est pas personnalisable (voir MessagePreview ci-dessous).
const LEVEL_EMBED_COLOR = '#F0A020';

// Miroir des colonnes réelles de XpSettings en base (voir schema.prisma).
interface LevelsConfigData {
  enabled: boolean;
  levelUpAnnounceMode: string;
  levelUpChannelId: string | null;
  levelUpMessage: string;
  levelUpMinLevel: number;
  xpMin: number;
  xpMax: number;
  cooldownSeconds: number;
  voiceXpEnabled: boolean;
  voiceXpMin: number;
  voiceXpMax: number;
  voiceXpIntervalSeconds: number;
  curveStyle: string;
  curveMultiplier: number;
  maxLevel: number;
  xpRoleMode: string;
  ignoredRoleIds: string[];
  boosterRoleIds: string[];
  xpChannelMode: string;
  ignoredChannelIds: string[];
  boosterChannelIds: string[];
}

const DEFAULT_CONFIG: LevelsConfigData = {
  enabled: false,
  levelUpAnnounceMode: 'channel',
  levelUpChannelId: null,
  levelUpMessage: '{user}, vous venez de passer au niveau {level} !',
  levelUpMinLevel: 0,
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 30,
  voiceXpEnabled: false,
  voiceXpMin: 5,
  voiceXpMax: 15,
  voiceXpIntervalSeconds: 60,
  curveStyle: 'exponential',
  curveMultiplier: 1,
  maxLevel: 0,
  xpRoleMode: 'without',
  ignoredRoleIds: [],
  boosterRoleIds: [],
  xpChannelMode: 'without',
  ignoredChannelIds: [],
  boosterChannelIds: [],
};

const CURVE_LABELS: Record<string, string> = {
  exponential: 'exponentielle',
  linear: 'linéaire',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// Ligne "résumé + bouton Modifier" — utilisée pour les 3 réglages détaillés
// dans une popup (Expérience par message, Expérience en vocal, Courbe).
function SummaryRow({ label, summary, onEdit }: { label: string; summary: string; onEdit: () => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <div className="input flex-1 truncate text-gray-300">{summary}</div>
        <button type="button" onClick={onEdit} className="btn-secondary shrink-0 text-sm">
          Modifier
        </button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.trunc(Number(e.target.value) || 0)))}
        className="input"
      />
    </div>
  );
}

// Popup générique (façon BannerEditorModal) — un titre + un contenu libre +
// un bouton Fermer, réutilisé pour les 3 réglages détaillés.
function EditModal({
  title,
  wide,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full rounded-xl border border-white/10 bg-[#1a1d23] p-5 shadow-2xl ${wide ? 'max-w-xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary text-sm">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// Bulle Discord + embed façon "level up" — le visuel (couleur, avatar en
// médaillon, titre "Félicitations !") est fixe, seul le texte brut
// au-dessus (levelUpMessage) est personnalisable.
function MessagePreview({
  botName,
  botAvatarUrl,
  now,
  avatarUrl,
  levelUpMessage,
  previewUsername,
  level,
  roles,
  channels,
}: {
  botName: string;
  botAvatarUrl: string | null;
  now: string;
  avatarUrl: string;
  levelUpMessage: string;
  previewUsername: string;
  level: number;
  roles: RoleOption[];
  channels: Channel[];
}) {
  // {user} devient une vraie mention bleue (comme Discord), {level} reste du
  // texte normal ici — seule la reprise du niveau dans l'embed ci-dessous
  // est mise en avant en orange.
  const contentParts = levelUpMessage.replaceAll('{level}', String(level)).split('{user}');

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center gap-2">
        {botAvatarUrl ? (
          <img src={botAvatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
            {botName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white">{botName}</span>
          <span className="rounded bg-[var(--accent)] px-1 py-0.5 text-[9px] font-medium text-white">APP</span>
          <span className="text-xs text-gray-500">{now}</span>
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm text-[#dcddde]">
        {contentParts.map((part, i) => (
          <span key={i}>
            {renderMentionText(part, roles, channels)}
            {i < contentParts.length - 1 && <span className="text-[#00a8fc]">@{previewUsername}</span>}
          </span>
        ))}
      </p>

      <div className="flex overflow-hidden rounded">
        <div className="w-1 shrink-0" style={{ backgroundColor: LEVEL_EMBED_COLOR }} />
        <div className="flex min-w-0 flex-1 items-center gap-3 bg-[#2b2d31] p-3">
          <img
            src={avatarUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full ring-2"
            style={{ boxShadow: `0 0 0 2px ${LEVEL_EMBED_COLOR}` }}
          />
          <div className="min-w-0">
            <p className="text-lg font-bold text-white">Félicitations !</p>
            <p className="text-sm text-[#dcddde]">vous avez atteint</p>
            <p className="text-sm font-bold" style={{ color: LEVEL_EMBED_COLOR }}>
              le niveau {level}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LevelsConfigPage({
  guildId,
  previewAvatarUrl,
  guildName,
  guildIconUrl,
  previewUsername,
  botName,
  botAvatarUrl,
  initial,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  previewAvatarUrl: string;
  previewUsername: string;
  botName: string;
  botAvatarUrl: string | null;
  initial?: LevelsConfigData;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [config, setConfig] = useState<LevelsConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingModal, setEditingModal] = useState<'xp' | 'voice' | 'curve' | null>(null);
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/channels`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Channel[]) => {
        if (!cancelled) setChannels(list);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/roles`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: RoleOption[]) => {
        if (!cancelled) setRoles(list);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guilds/${guildId}/emojis`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: GuildEmoji[]) => {
        if (cancelled) return;
        setGuildEmojis(list);
        for (const e of list) {
          const img = new Image();
          img.src = `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=48`;
        }
      })
      .catch(() => {
        if (!cancelled) setGuildEmojis([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  function update<K extends keyof LevelsConfigData>(key: K, value: LevelsConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  const isDirty = JSON.stringify(config) !== lastSaved;

  const { setDirty } = useUnsavedChanges();
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  function resetConfig() {
    setConfig(JSON.parse(lastSaved) as LevelsConfigData);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/levels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      setLastSaved(JSON.stringify(config));
      setMessage('✅ Enregistré');
      router.refresh();
    } else {
      setMessage("❌ Erreur lors de l'enregistrement");
    }
    setSaving(false);
  }

  const announceEnabled = config.levelUpAnnounceMode !== 'disabled';
  const xpSummary = `Entre ${config.xpMin} et ${config.xpMax} xp par message toutes les ${config.cooldownSeconds} secondes`;
  const voiceSummary = config.voiceXpEnabled
    ? `Entre ${config.voiceXpMin} et ${config.voiceXpMax} xp toutes les ${config.voiceXpIntervalSeconds} secondes`
    : 'Désactivé';
  const curveSummary = `Courbe ${CURVE_LABELS[config.curveStyle] ?? config.curveStyle} avec multiplicateur x${config.curveMultiplier}`;
  const previewLevel = 5;

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Niveaux</h1>
          <p className="text-sm text-gray-500">Récompensez l&apos;activité de vos membres avec un système de niveaux et d&apos;expérience.</p>
        </div>
        <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <section className="space-y-4">
        {/* Ligne 1 : annonce + niveau minimum (si activée). */}
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Annonce d&apos;un nouveau niveau
            </span>
            <div className="relative">
              <select
                value={config.levelUpAnnounceMode}
                onChange={(e) => update('levelUpAnnounceMode', e.target.value)}
                className="input appearance-none pr-9"
              >
                <option value="disabled">Désactivé</option>
                <option value="channel">Dans un salon personnalisé</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {announceEnabled && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Niveau minimum (annonce d&apos;un nouveau niveau)
              </span>
              <input
                type="number"
                min={0}
                value={config.levelUpMinLevel}
                onChange={(e) => update('levelUpMinLevel', Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                className="input"
              />
            </div>
          )}
        </div>

        {/* Ligne 2 : salon + message à gauche, prévisualisation à droite —
            pas de contrainte d'alignement entre les deux ici. */}
        {announceEnabled && (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Salon</span>
                <ChannelSelect
                  label=""
                  channels={channels}
                  value={config.levelUpChannelId ?? ''}
                  onChange={(v) => update('levelUpChannelId', v || null)}
                  loading={channelsLoading}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Message personnalisé
                </span>
                <div className="relative">
                  <MentionTextarea
                    value={config.levelUpMessage}
                    onChange={(v) => update('levelUpMessage', v)}
                    roles={roles}
                    channels={channels}
                    rows={4}
                    maxLength={1000}
                    className="input resize-none pr-9"
                  />
                  <div className="absolute right-2 top-2">
                    <EmojiPickerButton
                      guildName={guildName}
                      guildIconUrl={guildIconUrl}
                      guildEmojis={guildEmojis}
                      onPick={(e) => update('levelUpMessage', (config.levelUpMessage + e).slice(0, 1000))}
                    />
                  </div>
                </div>
                <p className="mt-1 text-right text-xs text-gray-500">{config.levelUpMessage.length} /1000</p>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Prévisualisation
              </span>
              <MessagePreview
                botName={botName}
                botAvatarUrl={botAvatarUrl}
                now={now}
                avatarUrl={previewAvatarUrl}
                levelUpMessage={config.levelUpMessage}
                previewUsername={previewUsername}
                level={previewLevel}
                roles={roles}
                channels={channels}
              />
            </div>
          </div>
        )}

        {/* Ligne 3 : toujours alignées côte à côte, peu importe l'annonce. */}
        <div className="grid gap-8 lg:grid-cols-2">
          <SummaryRow label="Expérience par message" summary={xpSummary} onEdit={() => setEditingModal('xp')} />
          <SummaryRow label="Expérience en vocal" summary={voiceSummary} onEdit={() => setEditingModal('voice')} />
        </div>

        {/* Ligne 4 : toujours alignées côte à côte, peu importe l'annonce. */}
        <div className="grid gap-8 lg:grid-cols-2">
          <SummaryRow label="Courbe d'expérience" summary={curveSummary} onEdit={() => setEditingModal('curve')} />
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Niveau maximum (0 pour infini)
            </span>
            <input
              type="number"
              min={0}
              value={config.maxLevel}
              onChange={(e) => update('maxLevel', Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              className="input"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-8">
        <div>
          <h2 className="font-semibold text-white">Limitations et boosts</h2>
          <p className="text-sm text-gray-500">
            Contrôlez qui gagne de l&apos;expérience et boostez certains rôles ou salons.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Rôles{' '}
              <span className={config.xpRoleMode === 'with' ? 'text-white' : 'text-gray-600'}>avec</span>
              {' / '}
              <span className={config.xpRoleMode === 'without' ? 'text-white' : 'text-gray-600'}>sans</span> gain
              d&apos;expérience
            </span>
            <MultiEntitySelect
              entities={roles}
              selectedIds={config.ignoredRoleIds}
              onChange={(ids) => update('ignoredRoleIds', ids)}
              rightSlot={
                <button
                  type="button"
                  onClick={() => update('xpRoleMode', config.xpRoleMode === 'with' ? 'without' : 'with')}
                  title="Basculer avec / sans"
                  className="text-gray-400 hover:text-white"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              }
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Salons{' '}
              <span className={config.xpChannelMode === 'with' ? 'text-white' : 'text-gray-600'}>avec</span>
              {' / '}
              <span className={config.xpChannelMode === 'without' ? 'text-white' : 'text-gray-600'}>sans</span> gain
              d&apos;expérience
            </span>
            <MultiEntitySelect
              entities={channels}
              selectedIds={config.ignoredChannelIds}
              onChange={(ids) => update('ignoredChannelIds', ids)}
              rightSlot={
                <button
                  type="button"
                  onClick={() => update('xpChannelMode', config.xpChannelMode === 'with' ? 'without' : 'with')}
                  title="Basculer avec / sans"
                  className="text-gray-400 hover:text-white"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              }
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Rôles boosters
            </span>
            <MultiEntitySelect
              entities={roles}
              selectedIds={config.boosterRoleIds}
              onChange={(ids) => update('boosterRoleIds', ids)}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Salons boosters
            </span>
            <MultiEntitySelect
              entities={channels}
              selectedIds={config.boosterChannelIds}
              onChange={(ids) => update('boosterChannelIds', ids)}
            />
          </div>
        </div>
      </section>

      {editingModal === 'xp' && (
        <EditModal title="Expérience par message" onClose={() => setEditingModal(null)}>
          <NumberField label="XP minimum" value={config.xpMin} onChange={(v) => update('xpMin', v)} />
          <NumberField label="XP maximum" value={config.xpMax} onChange={(v) => update('xpMax', v)} />
          <NumberField label="Délai entre deux gains (secondes)" value={config.cooldownSeconds} onChange={(v) => update('cooldownSeconds', v)} />
        </EditModal>
      )}

      {editingModal === 'voice' && (
        <EditModal title="Expérience en vocal" onClose={() => setEditingModal(null)}>
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle checked={config.voiceXpEnabled} onChange={(v) => update('voiceXpEnabled', v)} />
            <span className="text-sm text-gray-400">Activer l&apos;expérience gagnée en salon vocal.</span>
          </label>
          {config.voiceXpEnabled && (
            <>
              <NumberField label="XP minimum" value={config.voiceXpMin} onChange={(v) => update('voiceXpMin', v)} />
              <NumberField label="XP maximum" value={config.voiceXpMax} onChange={(v) => update('voiceXpMax', v)} />
              <NumberField
                label="Intervalle entre deux gains (secondes)"
                value={config.voiceXpIntervalSeconds}
                onChange={(v) => update('voiceXpIntervalSeconds', v)}
              />
            </>
          )}
        </EditModal>
      )}

      {editingModal === 'curve' && (
        <EditModal title="Courbe d'expérience" wide onClose={() => setEditingModal(null)}>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Style de courbe</span>
            <select value={config.curveStyle} onChange={(e) => update('curveStyle', e.target.value)} className="input">
              <option value="exponential">Exponentielle</option>
              <option value="linear">Linéaire</option>
            </select>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Multiplicateur</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={config.curveMultiplier}
              onChange={(e) => update('curveMultiplier', Math.max(0.1, Number(e.target.value) || 1))}
              className="input"
            />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Aperçu de l&apos;expérience nécessaire par niveau
            </span>
            <XpCurveChart curveStyle={config.curveStyle} multiplier={config.curveMultiplier} />
          </div>
        </EditModal>
      )}

      <div className="fixed bottom-0 left-64 right-0 flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-8 py-4">
        {message && <p className="text-sm">{message}</p>}
        <button
          type="button"
          onClick={resetConfig}
          disabled={!isDirty || saving}
          title="Annule toutes les modifications non enregistrées de cette page"
          className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Réinitialiser
        </button>
        <button type="button" onClick={save} disabled={!isDirty || saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
