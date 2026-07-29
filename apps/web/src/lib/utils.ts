import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function guildIconUrl(guildId: string, icon: string | null, size = 64): string {
  if (!icon) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(guildId) >> 22n) % 6}.png`;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

export function userAvatarUrl(userId: string, avatar: string | null, size = 64): string {
  if (!avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=${size}`;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export const LOG_TYPE_LABELS: Record<string, string> = {
  message_delete: 'Message supprimé',
  message_edit: 'Message modifié',
  member_join: 'Arrivée membre',
  member_leave: 'Départ membre',
  mod_action: 'Action modération',
  ticket_create: 'Ticket créé',
  ticket_close: 'Ticket fermé',
  ticket_reopen: 'Ticket rouvert',
  level_up: 'Montée de niveau',
};
