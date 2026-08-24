'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight, DoorOpen, Home, MessageSquare, ScrollText, SmilePlus, Tag, Ticket, TrendingUp } from 'lucide-react';
import { UnsavedChangesProvider, useUnsavedChanges } from '@/lib/unsaved-changes-context';

// Réduit aux modules déjà (ou bientôt) reconstruits — les autres reviendront
// au fur et à mesure, module par module. "slug" vide = page d'accueil du
// serveur (/dashboard/[guildId] sans segment supplémentaire).
const NAV_ITEMS = [
  { slug: '', label: 'Accueil', icon: Home },
  { slug: 'welcome', label: 'Arrivées et départs', icon: DoorOpen },
  { slug: 'levels', label: 'Niveaux', icon: TrendingUp },
  { slug: 'messages', label: 'Message', icon: MessageSquare },
  { slug: 'reaction-roles', label: 'Rôles-Réactions', icon: SmilePlus },
  { slug: 'tickets', label: 'Tickets', icon: Ticket },
  { slug: 'server-tag', label: 'Tag du serveur', icon: Tag },
  { slug: 'logs', label: 'Logs', icon: ScrollText },
] as const;

function guildIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=64`;
}

export function DashboardShell(props: {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  username: string;
  userAvatarUrl: string;
  botOnline: boolean;
  children: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
      <DashboardShellContent {...props} />
    </UnsavedChangesProvider>
  );
}

function DashboardShellContent({
  guildId,
  guildName,
  guildIcon,
  username,
  userAvatarUrl,
  botOnline,
  children,
}: {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  username: string;
  userAvatarUrl: string;
  botOnline: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDirty } = useUnsavedChanges();
  const iconUrl = guildIconUrl(guildId, guildIcon);

  // Bloque la navigation vers un autre module (ou le changement de serveur)
  // tant que la page actuelle a des modifications non enregistrées.
  function guardedNavigate(e: React.MouseEvent, href: string) {
    if (!isDirty) return;
    e.preventDefault();
    const leaveAnyway = window.confirm(
      'Vous avez des modifications non enregistrées sur cette page. Enregistrez ou réinitialisez avant de changer de module — ou cliquez sur OK pour quitter sans enregistrer.'
    );
    if (leaveAnyway) router.push(href);
  }

  function guardedLogout(e: React.MouseEvent) {
    if (!isDirty) return;
    e.preventDefault();
    const leaveAnyway = window.confirm(
      'Vous avez des modifications non enregistrées sur cette page. Enregistrez ou réinitialisez avant de vous déconnecter — ou cliquez sur OK pour continuer sans enregistrer.'
    );
    if (leaveAnyway) window.location.href = '/api/auth/logout';
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--card)] pt-4">
        <div className="flex items-center justify-between px-4">
          <span
            className={`h-2.5 w-2.5 rounded-full ${botOnline ? 'bg-[#57F287]' : 'bg-gray-600'}`}
            title={botOnline ? 'Bot connecté' : 'Bot hors ligne'}
          />
          <Link
            href="/dashboard"
            onClick={(e) => guardedNavigate(e, '/dashboard')}
            title="Changer de serveur"
            className="text-gray-500 hover:text-white"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-2 flex flex-col items-center gap-2 px-4 pb-4 text-center">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-white">
              {guildName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="line-clamp-2 text-base font-bold leading-tight text-white">{guildName}</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV_ITEMS.map((item) => {
            const href = item.slug ? `/dashboard/${guildId}/${item.slug}` : `/dashboard/${guildId}`;
            const active = pathname === href;
            const Icon = item.icon;
            return (
              <Link
                key={item.slug}
                href={href}
                onClick={(e) => guardedNavigate(e, href)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-gray-400 hover:bg-[var(--card-hover)] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex h-[72px] shrink-0 items-center gap-3 border-t border-[var(--border)] px-4">
          <img src={userAvatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{username}</p>
            <a href="/api/auth/logout" onClick={guardedLogout} className="text-xs font-medium text-[#ED4245] hover:underline">
              Déconnecter
            </a>
          </div>
        </div>
      </aside>

      <div className="ml-64 min-h-screen p-8">{children}</div>
    </div>
  );
}
