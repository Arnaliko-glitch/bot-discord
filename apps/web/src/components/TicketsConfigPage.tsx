'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { EmojiPickerButton } from '@/components/EmojiPickerButton';
import { MentionTextarea, type RoleOption } from '@/components/MentionTextarea';
import { MultiEntitySelect } from '@/components/MultiEntitySelect';
import type { GuildEmoji } from '@/lib/emoji-data';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

// Miroir des colonnes réelles de TicketConfig en base (voir schema.prisma).
interface TicketsConfigData {
  enabled: boolean;
  categoryId: string | null;
  logChannelId: string | null;
  validationEnabled: boolean;
  confirmationMessage: string;
  askOpenReason: boolean;
  askCloseReason: boolean;
  ticketNameFormat: string;
  openPrivateThread: boolean;
  autoSaveTranscript: boolean;
  accessRoleIds: string[];
  moderatorRoleIds: string[];
  mentionModerators: boolean;
  maxOpenPerUser: number;
  noReasonMessage: string;
  autoDeleteOnClose: boolean;
  openingMessage: string;
}

const DEFAULT_CONFIG: TicketsConfigData = {
  enabled: false,
  categoryId: null,
  logChannelId: null,
  validationEnabled: true,
  confirmationMessage:
    'Votre ticket a bien été envoyé, un membre du staff vous prendra rapidement en charge si votre ticket est accepté !',
  askOpenReason: true,
  askCloseReason: true,
  ticketNameFormat: '{user.globalname}',
  openPrivateThread: false,
  autoSaveTranscript: false,
  accessRoleIds: [],
  moderatorRoleIds: [],
  mentionModerators: true,
  maxOpenPerUser: 1,
  noReasonMessage: "N'hésitez pas à décrire votre problème, un membre du staff vous prendra rapidement en charge.",
  autoDeleteOnClose: true,
  openingMessage: 'Bonjour {user}, décrivez votre problème et un membre du staff vous répondra sous peu.',
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

function FieldLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
      {help && (
        <span title={help}>
          <CircleHelp className="h-3.5 w-3.5 cursor-help text-gray-600" />
        </span>
      )}
    </span>
  );
}

function ToggleField({
  checked,
  onChange,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <Toggle checked={checked} onChange={onChange} />
      <span className="text-sm text-gray-400">{description}</span>
    </label>
  );
}

function EditModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-white/10 bg-[#1a1d23] p-5 shadow-2xl"
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

export function TicketsConfigPage({
  guildId,
  guildName,
  guildIconUrl,
  initial,
}: {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  initial?: TicketsConfigData;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [config, setConfig] = useState<TicketsConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingOpeningMessage, setEditingOpeningMessage] = useState(false);
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
    fetch(`/api/guilds/${guildId}/channels?type=category`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Channel[]) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
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
        if (!cancelled) setGuildEmojis(list);
      })
      .catch(() => {
        if (!cancelled) setGuildEmojis([]);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  function update<K extends keyof TicketsConfigData>(key: K, value: TicketsConfigData[K]) {
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
    setConfig(JSON.parse(lastSaved) as TicketsConfigData);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/tickets`, {
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

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tickets</h1>
          <p className="text-sm text-gray-500">
            Permettez à vos membres de contacter l&apos;ensemble des responsables de votre communauté à l&apos;abri des
            regards
          </p>
        </div>
        <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <FieldLabel>Catégorie des tickets</FieldLabel>
            <ChannelSelect
              label=""
              channels={categories}
              value={config.categoryId ?? ''}
              onChange={(v) => update('categoryId', v || null)}
              loading={channelsLoading}
            />
          </div>

          <div>
            <FieldLabel help="Salon où les demandes de ticket sont envoyées pour validation, et où les logs de tickets sont publiés.">
              Salon de validation de tickets &amp; logs
            </FieldLabel>
            <ChannelSelect
              label=""
              channels={channels}
              value={config.logChannelId ?? ''}
              onChange={(v) => update('logChannelId', v || null)}
              loading={channelsLoading}
            />
          </div>

          <div>
            <FieldLabel>Validation des tickets</FieldLabel>
            <ToggleField
              checked={config.validationEnabled}
              onChange={(v) => update('validationEnabled', v)}
              description="Voulez-vous valider les raisons d'ouverture des tickets avant leur création ?"
            />
          </div>

          <div>
            <FieldLabel>Message de confirmation d&apos;envoi de demande de ticket</FieldLabel>
            <div className="relative">
              <MentionTextarea
                value={config.confirmationMessage}
                onChange={(v) => update('confirmationMessage', v)}
                roles={roles}
                channels={channels}
                rows={4}
                maxLength={4000}
                className="input resize-none pr-9"
              />
              <div className="absolute right-2 top-2">
                <EmojiPickerButton
                  guildName={guildName}
                  guildIconUrl={guildIconUrl}
                  guildEmojis={guildEmojis}
                  onPick={(e) => update('confirmationMessage', (config.confirmationMessage + e).slice(0, 4000))}
                />
              </div>
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">{config.confirmationMessage.length} /4000</p>
          </div>

          <div>
            <FieldLabel>Motif d&apos;ouverture</FieldLabel>
            <ToggleField
              checked={config.askOpenReason}
              onChange={(v) => update('askOpenReason', v)}
              description="Voulez-vous demander un motif d'ouverture pour la création d'un ticket ?"
            />
          </div>

          <div>
            <FieldLabel>Motif de fermeture</FieldLabel>
            <ToggleField
              checked={config.askCloseReason}
              onChange={(v) => update('askCloseReason', v)}
              description="Voulez-vous demander aux modérateurs un motif de fermeture pour les tickets ?"
            />
          </div>

          <div>
            <FieldLabel>Format des salons</FieldLabel>
            <input
              value={config.ticketNameFormat}
              onChange={(e) => update('ticketNameFormat', e.target.value.slice(0, 100))}
              className="input"
            />
          </div>

          <div>
            <FieldLabel>Ouvrir un fil privé pour chaque ticket</FieldLabel>
            <ToggleField
              checked={config.openPrivateThread}
              onChange={(v) => update('openPrivateThread', v)}
              description="Afin de permettre aux administrateurs et modérateurs de tickets de parler sans le membre concerné, voulez-vous qu'un fil privé soit ouvert automatiquement dans le ticket ?"
            />
          </div>

          <div>
            <FieldLabel>Sauvegarde de la conversation automatique</FieldLabel>
            <ToggleField
              checked={config.autoSaveTranscript}
              onChange={(v) => update('autoSaveTranscript', v)}
              description="Voulez-vous que le contenu du ticket soit automatiquement sauvegardé lors de sa fermeture ?"
            />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <FieldLabel help="Ces rôles peuvent voir et gérer tous les tickets en plus de leur créateur.">
              Rôles d&apos;accès aux tickets
            </FieldLabel>
            <MultiEntitySelect
              entities={roles}
              selectedIds={config.accessRoleIds}
              onChange={(ids) => update('accessRoleIds', ids)}
              placeholder="Aucun rôle"
            />
          </div>

          <div>
            <FieldLabel help="Ces rôles reçoivent la responsabilité de traiter les tickets (validation, fermeture...).">
              Rôles modérateurs de tickets
            </FieldLabel>
            <MultiEntitySelect
              entities={roles}
              selectedIds={config.moderatorRoleIds}
              onChange={(ids) => update('moderatorRoleIds', ids)}
              placeholder="Aucun rôle"
            />
          </div>

          <div>
            <FieldLabel>Mention des rôles modérateurs</FieldLabel>
            <ToggleField
              checked={config.mentionModerators}
              onChange={(v) => update('mentionModerators', v)}
              description="Voulez-vous mentionner les rôles modérateurs de tickets lorsqu'une demande d'ouverture est effectuée ?"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <FieldLabel>Tickets ouverts par membre</FieldLabel>
              <span className="text-xs font-semibold text-gray-400">
                {config.maxOpenPerUser} TICKET{config.maxOpenPerUser > 1 ? 'S' : ''}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={config.maxOpenPerUser}
              onChange={(e) => update('maxOpenPerUser', Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>

          <div>
            <FieldLabel>Message d&apos;accueil lorsqu&apos;aucune raison n&apos;est indiquée</FieldLabel>
            <div className="relative">
              <MentionTextarea
                value={config.noReasonMessage}
                onChange={(v) => update('noReasonMessage', v)}
                roles={roles}
                channels={channels}
                rows={5}
                maxLength={4000}
                className="input resize-none pr-9"
              />
              <div className="absolute right-2 top-2">
                <EmojiPickerButton
                  guildName={guildName}
                  guildIconUrl={guildIconUrl}
                  guildEmojis={guildEmojis}
                  onPick={(e) => update('noReasonMessage', (config.noReasonMessage + e).slice(0, 4000))}
                />
              </div>
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">{config.noReasonMessage.length} /4000</p>
          </div>

          <div>
            <FieldLabel>Suppression automatique</FieldLabel>
            <ToggleField
              checked={config.autoDeleteOnClose}
              onChange={(v) => update('autoDeleteOnClose', v)}
              description="Voulez-vous que le ticket soit automatiquement supprimé lorsqu'il est fermé par un administrateur ou un modérateur de tickets ?"
            />
          </div>

          <div>
            <FieldLabel>Message d&apos;ouverture de ticket</FieldLabel>
            <button type="button" onClick={() => setEditingOpeningMessage(true)} className="btn-primary">
              Créer un message
            </button>
          </div>
        </div>
      </div>

      {editingOpeningMessage && (
        <EditModal title="Message d'ouverture de ticket" onClose={() => setEditingOpeningMessage(false)}>
          <div className="relative">
            <MentionTextarea
              value={config.openingMessage}
              onChange={(v) => update('openingMessage', v)}
              roles={roles}
              channels={channels}
              rows={5}
              maxLength={4000}
              className="input resize-none pr-9"
            />
            <div className="absolute right-2 top-2">
              <EmojiPickerButton
                guildName={guildName}
                guildIconUrl={guildIconUrl}
                guildEmojis={guildEmojis}
                onPick={(e) => update('openingMessage', (config.openingMessage + e).slice(0, 4000))}
              />
            </div>
          </div>
          <p className="text-right text-xs text-gray-500">{config.openingMessage.length} /4000</p>
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
