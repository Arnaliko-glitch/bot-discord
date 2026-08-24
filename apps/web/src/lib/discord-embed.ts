// Construction du JSON d'embed envoyé à l'API REST Discord — partagée entre
// le composeur de messages et le module Rôles-réactions pour ne jamais avoir
// deux implémentations qui divergent (voir aussi EmbedEditor.tsx côté UI).
export interface EmbedData {
  authorName?: string | null;
  authorIconUrl?: string | null;
  title?: string | null;
  titleUrl?: string | null;
  description?: string | null;
  color?: string | null;
  fields?: { name: string; value: string }[];
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  footerText?: string | null;
  footerIconUrl?: string | null;
}

// Discord doit pouvoir télécharger l'image depuis une URL publique — un
// upload local (/uploads/...) n'est qu'un chemin relatif servi par ce
// dashboard, à préfixer par son URL publique.
export function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  return `${appUrl}${url}`;
}

export function buildOneEmbed(embedData: EmbedData): Record<string, unknown> {
  const embed: Record<string, unknown> = {};
  if (embedData.authorName) {
    embed.author = embedData.authorIconUrl
      ? { name: embedData.authorName, icon_url: toAbsoluteUrl(embedData.authorIconUrl) }
      : { name: embedData.authorName };
  }
  if (embedData.title) embed.title = embedData.title;
  if (embedData.title && embedData.titleUrl) embed.url = embedData.titleUrl;
  if (embedData.description) embed.description = embedData.description;
  if (embedData.color) embed.color = parseInt(embedData.color.replace('#', ''), 16);
  const fields = (embedData.fields ?? []).filter((f) => f.name && f.value);
  if (fields.length > 0) embed.fields = fields;
  if (embedData.footerText) {
    embed.footer = embedData.footerIconUrl
      ? { text: embedData.footerText, icon_url: toAbsoluteUrl(embedData.footerIconUrl) }
      : { text: embedData.footerText };
  }
  if (embedData.thumbnailUrl) embed.thumbnail = { url: toAbsoluteUrl(embedData.thumbnailUrl) };
  if (embedData.imageUrl) embed.image = { url: toAbsoluteUrl(embedData.imageUrl) };
  return embed;
}
