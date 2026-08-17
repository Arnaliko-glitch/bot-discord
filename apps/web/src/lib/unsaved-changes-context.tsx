'use client';

import { createContext, useContext, useMemo, useState } from 'react';

// Partagé entre une page de module (qui sait si son formulaire a des
// modifications non enregistrées) et la sidebar (qui doit bloquer la
// navigation vers un autre module tant que c'est le cas).
interface UnsavedChangesContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirty] = useState(false);
  const value = useMemo(() => ({ isDirty, setDirty }), [isDirty]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('useUnsavedChanges doit être utilisé sous UnsavedChangesProvider');
  return ctx;
}
