import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default function HomePage() {
  const session = getSession();
  if (session) redirect('/dashboard');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <h1 className="text-3xl font-bold text-white">Onory Bot Dashboard</h1>
        <p className="mt-2 text-gray-400">Gérez votre bot Discord — Bienvenue, Tickets, XP, Logs</p>
      </div>
      <a href="/api/auth/login" className="btn-primary">
        Se connecter avec Discord
      </a>
    </main>
  );
}
