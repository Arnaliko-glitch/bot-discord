'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChannelSelect, type Channel } from '@/components/ChannelSelect';
import { MultiEntitySelect, type SelectableEntity } from '@/components/MultiEntitySelect';
import { useUnsavedChanges } from '@/lib/unsaved-changes-context';

export interface PrivateRoomsConfigData {
  enabled: boolean;
  hubChannelId: string | null;
  categoryId: string | null;
  nameTemplate: string;
  userLimit: number;
  permissionSource: string;
  creatorCanInvite: boolean;
  creatorPrioritySpeaker: boolean;
  creatorSetStatus: boolean;
  creatorManageChannel: boolean;
  creatorUseSoundboard: boolean;
  creatorManagePermissions: boolean;
  allowClaim: boolean;
  configMenuEnabled: boolean;
  moderatorRoleIds: string[];
  untouchableRoleIds: string[];
  accessRoleIds: string[];
}

const DEFAULT_CONFIG: PrivateRoomsConfigData = {
  enabled: false,
  hubChannelId: null,
  categoryId: null,
  nameTemplate: '🔊 Salon de {user}',
  userLimit: 0,
  permissionSource: 'category',
  creatorCanInvite: true,
  creatorPrioritySpeaker: true,
  creatorSetStatus: true,
  creatorManageChannel: false,
  creatorUseSoundboard: true,
  creatorManagePermissions: false,
  allowClaim: true,
  configMenuEnabled: true,
  moderatorRoleIds: [],
  untouchableRoleIds: [],
  accessRoleIds: [],
};

const CREATOR_PERMISSIONS: { key: keyof PrivateRoomsConfigData; label: string; hint: string }[] = [
  { key: 'creatorCanInvite', label: 'Créer une invitation', hint: 'Inviter des membres externes au salon.' },
  { key: 'creatorPrioritySpeaker', label: 'Priorité de la parole', hint: "S'entendre par-dessus les autres." },
  { key: 'creatorSetStatus', label: "Définir le statut du salon", hint: 'Le petit texte affiché sous le nom du salon.' },
  { key: 'creatorManageChannel', label: 'Gérer le salon', hint: 'Accès direct aux paramètres Discord du salon (avancé).' },
  { key: 'creatorUseSoundboard', label: 'Utiliser les soundboards', hint: 'Jouer des sons dans le salon.' },
  { key: 'creatorManagePermissions', label: 'Gérer les permissions', hint: 'Modifier les permissions Discord du salon (avancé).' },
];

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

function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 p-3 transition hover:border-white/20">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm text-white">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

// Rejoindre le salon "hub" crée un salon vocal temporaire pour le membre,
// avec un panneau de boutons publié dedans (Ouvrir/Fermer, Privé, Renommer,
// Limite, Purge, Transfert, Liste blanche/noire) façon DraftBot — supprimé
// dès qu'il se vide.
export function PrivateRoomsConfigPage({
  guildId,
  initial,
}: {
  guildId: string;
  initial?: PrivateRoomsConfigData;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<PrivateRoomsConfigData>(initial ?? DEFAULT_CONFIG);
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initial ?? DEFAULT_CONFIG));
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<SelectableEntity[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/guilds/${guildId}/channels?type=voice`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/guilds/${guildId}/channels?type=category`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/guilds/${guildId}/roles`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([voice, cats, roleList]) => {
        setVoiceChannels(voice);
        setCategories(cats);
        setRoles(roleList);
      })
      .catch(() => {
        setVoiceChannels([]);
        setCategories([]);
        setRoles([]);
      })
      .finally(() => setChannelsLoading(false));
  }, [guildId]);

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

  function update<K extends keyof PrivateRoomsConfigData>(key: K, value: PrivateRoomsConfigData[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/guilds/${guildId}/private-rooms`, {
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
          <h1 className="text-2xl font-bold text-white">Salons privés</h1>
          <p className="text-sm text-gray-500">
            Rejoindre le salon vocal choisi crée automatiquement un salon vocal temporaire pour le membre, supprimé dès
            qu&apos;il se vide.
          </p>
        </div>
        <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} />
      </div>

      <div className="card space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Salon vocal « hub »
          </span>
          <ChannelSelect
            label=""
            channels={voiceChannels}
            value={config.hubChannelId ?? ''}
            onChange={(v) => update('hubChannelId', v || null)}
            loading={channelsLoading}
          />
          <p className="mt-1 text-xs text-gray-500">Le salon vocal à rejoindre pour créer son propre salon.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Catégorie des salons créés
          </span>
          <ChannelSelect
            label=""
            channels={categories}
            value={config.categoryId ?? ''}
            onChange={(v) => update('categoryId', v || null)}
            loading={channelsLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Laissez vide pour créer les salons dans la même catégorie que le hub.
          </p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Nom du salon créé
          </span>
          <input
            value={config.nameTemplate}
            onChange={(e) => update('nameTemplate', e.target.value.slice(0, 100))}
            placeholder="🔊 Salon de {user}"
            className="input"
          />
          <p className="mt-1 text-xs text-gray-500">{'{user}'} est remplacé par le pseudo du créateur.</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Limite d&apos;utilisateurs</span>
            <span className="text-xs font-semibold text-gray-400">
              {config.userLimit === 0 ? 'ILLIMITÉ' : `${config.userLimit} PLACE${config.userLimit > 1 ? 'S' : ''}`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={99}
            value={config.userLimit}
            onChange={(e) => update('userLimit', Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Permissions de création</h2>
          <p className="text-xs text-gray-500">
            Source des permissions héritées par le salon créé, et droits Discord supplémentaires donnés au propriétaire
            sur son propre salon.
          </p>
        </div>

        <div className="flex gap-3">
          {[
            { value: 'category', label: 'Catégorie', hint: 'Hérite des permissions de la catégorie choisie ci-dessus.' },
            { value: 'hub', label: 'Salon hub', hint: 'Copie les permissions du salon « hub » lui-même.' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('permissionSource', opt.value)}
              className={`flex-1 rounded-lg border p-3 text-left transition ${
                config.permissionSource === opt.value ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <span className="block text-sm font-medium text-white">{opt.label}</span>
              <span className="block text-xs text-gray-500">{opt.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {CREATOR_PERMISSIONS.map((perm) => (
            <Checkbox
              key={perm.key}
              checked={config[perm.key] as boolean}
              onChange={(v) => update(perm.key, v as PrivateRoomsConfigData[typeof perm.key])}
              label={perm.label}
              hint={perm.hint}
            />
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Menu de gestion</h2>
          <p className="text-xs text-gray-500">Panneau de boutons publié dans chaque salon créé pour le gérer sans passer par Discord.</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm text-white">Publier le menu</h3>
            <p className="text-xs text-gray-500">Désactivez pour ne garder que la création/suppression automatique du salon.</p>
          </div>
          <Toggle checked={config.configMenuEnabled} onChange={(v) => update('configMenuEnabled', v)} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm text-white">Autoriser la réquisition</h3>
            <p className="text-xs text-gray-500">
              Un membre présent peut réclamer la propriété d&apos;un salon via le bouton « Transfert » si le propriétaire
              l&apos;a quitté.
            </p>
          </div>
          <Toggle checked={config.allowClaim} onChange={(v) => update('allowClaim', v)} />
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Rôles</h2>
          <p className="text-xs text-gray-500">Contrôle qui peut gérer ou accéder aux salons temporaires.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Rôles modérateurs</span>
          <MultiEntitySelect
            entities={roles}
            selectedIds={config.moderatorRoleIds}
            onChange={(ids) => update('moderatorRoleIds', ids)}
            placeholder="Aucun — seul le propriétaire gère son salon"
          />
          <p className="mt-1 text-xs text-gray-500">Peuvent utiliser le menu de gestion sur n&apos;importe quel salon temporaire.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Rôles intouchables</span>
          <MultiEntitySelect
            entities={roles}
            selectedIds={config.untouchableRoleIds}
            onChange={(ids) => update('untouchableRoleIds', ids)}
            placeholder="Aucun"
          />
          <p className="mt-1 text-xs text-gray-500">Ne peuvent jamais être expulsés (Purge) ni mis en liste noire.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Rôles d&apos;accès par défaut</span>
          <MultiEntitySelect
            entities={roles}
            selectedIds={config.accessRoleIds}
            onChange={(ids) => update('accessRoleIds', ids)}
            placeholder="Tout le monde (@everyone)"
          />
          <p className="mt-1 text-xs text-gray-500">
            Rôles autorisés à rejoindre un salon en mode « ouvert ». Laissez vide pour que tout le monde puisse rejoindre.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-64 right-0 flex h-[72px] items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-8">
        {message && <p className="text-sm">{message}</p>}
        <button
          type="button"
          onClick={() => setConfig(JSON.parse(lastSaved))}
          disabled={!isDirty || saving}
          className="rounded-lg border border-white/10 bg-[#f5f0e6] px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saving || (config.enabled && !config.hubChannelId)}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
