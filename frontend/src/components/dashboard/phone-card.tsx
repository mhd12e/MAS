import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/status-badge';
import { ContextMenu } from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Trash2, ExternalLink, MessageSquare } from 'lucide-react';
import { useApp } from '@/stores/app-store';
import type { EmulatorInfo } from '@/types';

const CARD_HEIGHT = 260;

export { CARD_HEIGHT };

export function PhoneCard({ phone }: { phone: EmulatorInfo }) {
  const navigate = useNavigate();
  const { renamePhone, removePhone, tasks } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(phone.name);

  useEffect(() => { if (!renaming) setNameValue(phone.name); }, [phone.name, renaming]);

  const commitRename = () => {
    if (nameValue.trim()) renamePhone(phone.id, nameValue.trim());
    setRenaming(false);
  };

  const taskCount = tasks.filter((t) => t.phoneId === phone.id).length;

  return (
    <ContextMenu
      items={[
        { label: 'Rename', icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => { setNameValue(phone.name); setRenaming(true); } },
        { label: 'Open workspace', icon: <ExternalLink className="h-3.5 w-3.5" />, onClick: () => navigate(`/phone/${phone.id}`), disabled: phone.status !== 'ready' },
        { label: 'Remove', icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => removePhone(phone.id), variant: 'destructive' },
      ]}
    >
      <div
        className="group cursor-pointer rounded-xl border border-border/30 bg-card/50 hover:bg-card/80 hover:border-primary/15 transition-all duration-300 overflow-hidden hover:shadow-xl hover:shadow-primary/[0.02] flex flex-col"
        style={{ height: CARD_HEIGHT }}
        onClick={() => !renaming && phone.status === 'ready' && navigate(`/phone/${phone.id}`)}
      >
        {/* Screen — fills available space */}
        <div className="relative flex-1 bg-gradient-to-b from-black/90 to-black border-b border-border/20 min-h-0">
          {phone.status === 'booting' ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                <Loader2 className="relative h-7 w-7 animate-spin text-primary/50" />
              </div>
              <div className="text-center">
                <p className="text-[11px] text-foreground/50 font-medium">Starting up</p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">15-30 seconds</p>
              </div>
            </div>
          ) : phone.status === 'ready' ? (
            <>
              <iframe
                src={`http://localhost:${phone.novncPort}/vnc.html?autoconnect=true&resize=scale&reconnect=true&view_only=true`}
                className="w-full h-full border-0 pointer-events-none"
                title={phone.name}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                <span className="text-[11px] text-white/80 font-medium bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5">
                  Open workspace
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[11px] text-destructive/40 font-medium">
                {phone.status === 'error' ? 'Error occurred' : 'Unavailable'}
              </p>
            </div>
          )}
        </div>

        {/* Info bar — fixed height */}
        <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1 mr-3">
            {renaming ? (
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
                onBlur={commitRename}
                autoFocus
                className="h-6 text-xs px-1.5 w-28"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div>
                <h3 className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors duration-200">{phone.name}</h3>
                {taskCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <MessageSquare className="h-2.5 w-2.5" />
                    {taskCount} task{taskCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          <StatusBadge status={phone.agentRunning ? 'working' : phone.status} />
        </div>
      </div>
    </ContextMenu>
  );
}
