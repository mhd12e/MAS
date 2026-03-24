import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: ReactNode;
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const justOpened = useRef(false);

  const handleContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    justOpened.current = true;
    setPos({ x: e.clientX, y: e.clientY });
    // Reset flag after the current event cycle completes
    requestAnimationFrame(() => { justOpened.current = false; });
  }, []);

  useEffect(() => {
    if (!pos) return;

    const close = (e: Event) => {
      // Don't close if we just opened (same event cycle)
      if (justOpened.current) return;
      // Don't close if clicking inside the menu
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setPos(null);
    };

    // Use setTimeout to avoid the current contextmenu event closing us immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('contextmenu', close);
      document.addEventListener('scroll', close, true);
      window.addEventListener('resize', () => setPos(null));
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  return (
    <>
      <div onContextMenu={handleContext}>{children}</div>
      {pos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-card shadow-xl shadow-black/20 p-1 animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: pos.x, top: pos.y }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); item.onClick(); setPos(null); }}
              disabled={item.disabled}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                item.disabled && 'opacity-40 cursor-not-allowed',
                item.variant === 'destructive'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
