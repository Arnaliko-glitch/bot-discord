'use client';

import { replacePlaceholders } from './welcome-preview-utils';

interface Props {
  title: string | null;
  description: string;
  color: string;
  footer: string | null;
  thumbnail?: boolean;
}

export function WelcomePreview({ title, description, color, footer, thumbnail = true }: Props) {
  const previewDesc = replacePlaceholders(description, {
    user: '@Remi',
    username: 'Remi',
    server: 'Mon Serveur',
    memberCount: 1337,
  });
  const previewTitle = title
    ? replacePlaceholders(title, { user: '@Remi', username: 'Remi', server: 'Mon Serveur', memberCount: 1337 })
    : null;
  const previewFooter = footer
    ? replacePlaceholders(footer, { user: '@Remi', username: 'Remi', server: 'Mon Serveur', memberCount: 1337 })
    : null;

  return (
    <div className="card sticky top-8">
      <h3 className="mb-4 font-semibold">Aperçu en direct</h3>
      <div className="overflow-hidden rounded-lg border-l-4 bg-[#2f3136] p-4" style={{ borderColor: color }}>
        <div className="flex gap-4">
          {thumbnail && (
            <img
              src="https://cdn.discordapp.com/embed/avatars/0.png"
              alt=""
              className="h-16 w-16 rounded-full"
            />
          )}
          <div className="min-w-0 flex-1">
            {previewTitle && <p className="mb-1 font-semibold text-white">{previewTitle}</p>}
            <p className="whitespace-pre-wrap text-sm text-[#dcddde]">{previewDesc}</p>
            {previewFooter && <p className="mt-2 text-xs text-gray-500">{previewFooter}</p>}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Variables: {'{user}'}, {'{username}'}, {'{server}'}, {'{memberCount}'}
      </p>
    </div>
  );
}
