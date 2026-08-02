import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Bot, Shield, Ticket, Sparkles, BarChart3, Users, ScrollText, Settings, Award } from 'lucide-react';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-lg font-bold">Bot Dashboard</span>
          </div>
          <a href="/api/auth/login" className="btn-primary">
            Connexion Discord
          </a>
        </div>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="mb-6 text-5xl font-bold tracking-tight">
            Gérez votre bot Discord
            <span className="mt-2 block bg-gradient-to-r from-[var(--accent)] to-purple-400 bg-clip-text text-transparent">
              comme un pro
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-400">
            Welcome messages, tickets, système XP, rôles par niveau, logs de modération — tout depuis une interface moderne.
          </p>
          <a href="/api/auth/login" className="btn-primary px-8 py-3 text-base">
            Commencer gratuitement
          </a>
        </section>
        <section className="border-t border-[var(--border)] bg-[var(--card)]/30 py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
            {[
              { icon: Sparkles, title: 'Welcome & Goodbye', desc: 'Messages personnalisés avec aperçu en direct' },
              { icon: Ticket, title: 'Système de tickets', desc: 'Support organisé avec panel et catégories' },
              { icon: Award, title: 'XP & Rôles', desc: 'Leveling automatique et récompenses par niveau' },
              { icon: ScrollText, title: 'Logs complets', desc: 'Historique des actions et modération' },
              { icon: Settings, title: 'Modules activables', desc: 'Activez/désactivez chaque fonctionnalité' },
              { icon: Shield, title: 'Permissions dashboard', desc: 'Contrôlez qui peut gérer les paramètres' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card transition hover:border-[var(--accent)]/40">
                <Icon className="mb-4 h-8 w-8 text-[var(--accent)]" />
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-sm text-gray-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}