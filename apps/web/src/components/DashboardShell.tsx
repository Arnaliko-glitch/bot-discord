'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Sparkles,
  Ticket,
  Award,
  Settings,
  BarChart3,
  Users,
  ScrollText,
  Shield,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { cn, guildIconUrl } from '@/lib/utils';

const navItems = [
  { href: '', label: 'Vue d\'ensemble', icon: BarChart3 },
  { href: '/welcome', label: 'Welcome', icon: Sparkles },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/xp', label: 'XP & Niveaux', icon: Award },
  { href: '/level-roles', label: 'Rôles niveau', icon: Award },
  { href: '/modules', label: 'Modules', icon: Settings },
  { href: '/users', label: 'Utilisateurs', icon: Users },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/permissions', label: 'Permissions', icon: Shield },
];

interface Props {
  guild: { id: string; name: string; icon: string | null };
  user: { username: string; avatar: string | null; id: string };
  children: React.ReactNode;
}

export function DashboardShell({ guild, user, children }: Props) {
  const pathname = usePathname();
  const base = `/dashboard/${guild.id}`;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-4">
          <Link href="/dashboard" className="mb-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white">
            <ChevronLeft className="h-4 w-4" /> Serveurs
          </Link>
          <div className="flex items-center gap-3">
            <img src={guildIconUrl(guild.id, guild.icon)} alt="" className="h-10 w-10 rounded-full" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{guild.name}</p>
              <p className="text-xs text-gray-500">Configuration</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const path = `${base}${href}`;
            const active = pathname === path || (href !== '' && pathname.startsWith(path));
            return (
              <Link
                key={href}
                href={path}
                className={cn('sidebar-link', active && 'sidebar-link-active')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-medium">{user.username}</span>
          </div>
          <a href="/api/auth/logout" className="sidebar-link w-full text-red-400 hover:text-red-300">
            <LogOut className="h-4 w-4" /> Déconnexion
          </a>
        </div>
      </aside>

      <main className="ml-64 flex-1 p-8">{children}</main>
    </div>
  );
}
