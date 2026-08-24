'use client';

import { useEffect, useRef, useState } from 'react';

// Nom éditable en ligne dans une carte de liste — clic pour éditer,
// sauvegarde automatique après une pause de frappe ou à la perte de focus
// (Entrée fait la même chose). Tout l'état d'édition reste local au
// composant (une instance par carte via `key`), le parent n'a qu'à fournir
// la fonction qui persiste le nouveau nom. Utilisé par les modules Messages
// et Rôles-réactions, pour ne jamais avoir deux implémentations qui divergent.
export function InlineRenameLabel({
  value,
  maxLength = 100,
  onCommit,
}: {
  value: string;
  maxLength?: number;
  onCommit: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La sauvegarde (PATCH) prend un instant à revenir — sans ça, sortir du
  // mode édition réaffichait la prop `value` (encore l'ancien nom tant que
  // le parent n'a pas reçu la réponse), avant de sauter sur le nouveau nom
  // une fois la requête terminée. On affiche donc toujours `draftValue`
  // (déjà à jour dès la frappe), synchronisé depuis `value` seulement quand
  // on n'est pas en train d'éditer.
  useEffect(() => {
    if (!editing) setDraftValue(value);
  }, [value, editing]);

  function startEditing() {
    setEditing(true);
  }

  function handleChange(raw: string) {
    const next = raw.slice(0, maxLength);
    setDraftValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next.trim() || 'Sans titre'), 600);
  }

  function finish() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const name = draftValue.trim() || 'Sans titre';
    // Normalisé seulement ici (pas pendant la frappe) — sinon un espace en
    // fin de saisie serait effacé sous les doigts de l'utilisateur à chaque
    // sauvegarde automatique en arrière-plan.
    setDraftValue(name);
    onCommit(name);
    setEditing(false);
  }

  return editing ? (
    <input
      autoFocus
      value={draftValue}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="-mx-2 -my-1 w-full rounded border border-[var(--accent)] bg-transparent px-2 py-1 text-sm font-medium text-white outline-none"
    />
  ) : (
    <p
      onClick={startEditing}
      className="-mx-2 -my-1 cursor-pointer truncate rounded border border-transparent px-2 py-1 text-sm font-medium text-white transition hover:border-white/20"
    >
      {draftValue}
    </p>
  );
}
