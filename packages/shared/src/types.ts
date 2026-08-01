export type BotModule =
  | 'welcome'
  | 'tickets'
  | 'xp'
  | 'levelRoles'
  | 'logging';
export const BOT_MODULES: BotModule[] = [
  'welcome',
  'tickets',
  'xp',
  'levelRoles',
  'logging',
];
export const MODULE_LABELS: Record<BotModule, string> = {
  welcome: 'Messages de bienvenue',
  tickets: 'Système de tickets',
  xp: 'XP & Niveaux',
  levelRoles: 'Rôles par niveau',
  logging: 'Logs de modération',
};
export type LogType =
  | 'message_delete'
  | 'message_edit'
  | 'member_join'
  | 'member_leave'
  | 'mod_action'
  | 'ticket_create'
  | 'ticket_close'
  | 'ticket_reopen'
  | 'level_up';
export type DashboardPermissionLevel = 'owner' | 'admin' | 'moderator';
export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}
export interface SessionUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  accessToken: string;
}
export interface WelcomePreview {
  title: string | null;
  description: string;
  color: string;
  thumbnailUrl: string | null;
  footer: string | null;
}
export interface GuildStats {
  memberCount: number;
  ticketCount: number;
  openTickets: number;
  totalXp: number;
  activeUsers: number;
  logsToday: number;
}
export interface XpUserSummary {
  discordUserId: string;
  username: string;
  avatar: string | null;
  xp: number;
  level: number;
  messageCount: number;
}
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return 5 * level * level + 50 * level + 100;
}
export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}
export function xpProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const level = levelFromXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const current = xp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  const percent = needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 100;
  return { level, current, needed, percent };
}