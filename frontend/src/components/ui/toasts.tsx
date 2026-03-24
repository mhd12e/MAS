import { useApp } from '@/stores/app-store';

export function Toasts() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground shadow-lg animate-in slide-in-from-right-2 fade-in-0 duration-300"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
