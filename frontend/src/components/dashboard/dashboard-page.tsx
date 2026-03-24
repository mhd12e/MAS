import { useNavigate } from 'react-router-dom';
import { useApp } from '@/stores/app-store';
import { useAuth } from '@/stores/auth-store';
import { PhoneCard, CARD_HEIGHT } from './phone-card';
import { PlaybackCard } from './playback-card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plus, Smartphone, Wifi, WifiOff, Bot, Film, Key, LogOut, BookOpen } from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { phones, recordings, addPhone, loading, backendUp } = useApp();
  const readyCount = phones.filter((p) => p.status === 'ready').length;
  const bootingCount = phones.filter((p) => p.status === 'booting').length;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[300px] -left-[200px] w-[600px] h-[600px] rounded-full bg-primary/[0.03] blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[300px] w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[100px]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-lg blur-md" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground tracking-tight">Mobile Agent Studio</span>
              <span className="hidden sm:inline text-xs text-muted-foreground ml-2">AI Phone Automation</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!backendUp ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                <WifiOff className="h-3 w-3 text-destructive" />
                <span className="text-[10px] font-medium text-destructive">Offline</span>
              </div>
            ) : phones.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/5 border border-success/10">
                <Wifi className="h-3 w-3 text-success/70" />
                <span className="text-[10px] font-medium text-muted-foreground">{phones.length} phone{phones.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            <Button size="sm" onClick={addPhone} disabled={loading} className="gap-1.5 h-8 px-4 text-xs rounded-full shadow-lg shadow-primary/10">
              <Plus className="h-3.5 w-3.5" />
              {loading ? 'Starting...' : 'New Phone'}
            </Button>
            <div className="w-px h-5 bg-border" />
            <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer" title="Documentation">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
              </Button>
            </a>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => navigate('/settings/api-keys')} title="API Keys">
              <Key className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={logout} title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6">
        {phones.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center pt-24 pb-16">
            {/* Hero icon */}
            <div className="relative mb-10">
              <div className="absolute inset-0 bg-primary/10 rounded-3xl blur-3xl scale-[2]" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-card to-card/80 border border-border/60 shadow-2xl shadow-primary/5">
                <Smartphone className="h-10 w-10 text-primary/50" />
              </div>
            </div>

            {/* Hero text */}
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 tracking-tight text-center">
              Control phones with<br />
              <span className="text-primary">natural language</span>
            </h1>
            <p className="text-sm text-muted-foreground mb-10 max-w-sm text-center leading-relaxed">
              Create virtual Android phones and automate them with AI.
              Install apps, navigate UIs, and extract information — all through simple instructions.
            </p>

            {/* CTA */}
            <Button onClick={addPhone} disabled={loading} size="lg" className="gap-2 rounded-full px-8 shadow-xl shadow-primary/15 mb-16">
              <Plus className="h-4 w-4" />
              {loading ? 'Starting...' : 'Create your first phone'}
            </Button>

            {/* Feature cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
              {[
                {
                  title: 'Virtual Android',
                  desc: 'Full emulator with live screen streaming via noVNC',
                  gradient: 'from-emerald-500/5 to-transparent',
                },
                {
                  title: 'AI Agent',
                  desc: 'Anthropic Claude controls the phone step by step',
                  gradient: 'from-blue-500/5 to-transparent',
                },
                {
                  title: 'Task History',
                  desc: 'Every action persisted — review and replay anytime',
                  gradient: 'from-amber-500/5 to-transparent',
                },
              ].map(({ title, desc, gradient }) => (
                <div key={title} className={`rounded-xl border border-border/40 bg-gradient-to-b ${gradient} p-5`}>
                  <h3 className="text-xs font-semibold text-foreground mb-1.5">{title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Phone grid ───────────────────────────────────────────── */
          <>
            {/* Section header */}
            <div className="flex items-center gap-3 py-6">
              <h2 className="text-base font-semibold text-foreground">Your phones</h2>
              <div className="flex items-center gap-2">
                {readyCount > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-card/50 border border-border/40 rounded-full px-2.5 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {readyCount} ready
                  </span>
                )}
                {bootingCount > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-card/50 border border-border/40 rounded-full px-2.5 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                    {bootingCount} booting
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-12">
              {phones.map((phone) => (
                <PhoneCard key={phone.id} phone={phone} />
              ))}

              {/* Ghost add card */}
              <button
                onClick={addPhone}
                disabled={loading}
                className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-border/30 hover:border-primary/20 bg-card/20 hover:bg-card/40 transition-all duration-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ height: CARD_HEIGHT }}
              >
                <div className="relative mb-3">
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border/40 group-hover:border-primary/20 group-hover:bg-primary/5 transition-all duration-300">
                    <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-300 font-medium">
                  {loading ? 'Starting...' : 'Add phone'}
                </span>
              </button>
            </div>

            {/* Playbacks section */}
            {recordings.length > 0 && (
              <>
                <Separator className="my-8 opacity-30" />
                <div className="flex items-center gap-3 mb-4">
                  <Film className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">Playbacks</h2>
                  <span className="text-[11px] text-muted-foreground bg-card/50 border border-border/40 rounded-full px-2.5 py-0.5">
                    {recordings.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                  {recordings.map((rec) => (
                    <PlaybackCard key={rec.id} recording={rec} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
