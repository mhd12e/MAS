import { useState } from 'react';
import { ContextMenu } from '@/components/ui/context-menu';
import { PlaybackViewer } from '@/components/ui/playback-viewer';
import { Trash2, Play, Clock, Smartphone } from 'lucide-react';
import { useApp } from '@/stores/app-store';
import { API_BASE } from '@/config';
import type { Recording } from '@/types';

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function PlaybackCard({ recording }: { recording: Recording }) {
  const { deleteRecording } = useApp();
  const [viewerOpen, setViewerOpen] = useState(false);
  const videoUrl = `${API_BASE}/recordings/${recording.id}/video`;

  return (
    <>
      <ContextMenu items={[
        { label: 'Delete', icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => deleteRecording(recording.id), variant: 'destructive' },
      ]}>
        <div
          className="group rounded-xl border border-border/30 bg-card/50 hover:bg-card/80 hover:border-primary/15 transition-all duration-300 overflow-hidden cursor-pointer"
          onClick={() => setViewerOpen(true)}
        >
          {/* Video preview */}
          <div className="relative bg-black border-b border-border/20" style={{ height: 140 }}>
            <video
              src={videoUrl}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
              onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-60 group-hover:opacity-0 transition-opacity">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                <Play className="h-4 w-4 text-white ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded">
              <Clock className="h-2.5 w-2.5" />
              {formatDuration(recording.durationSecs)}
            </div>
          </div>

          <div className="px-3.5 py-2.5">
            <p className="text-xs font-medium text-foreground truncate mb-1">{recording.taskTitle}</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Smartphone className="h-2.5 w-2.5" />
                {recording.phoneName}
              </span>
              <span>{formatDate(recording.createdAt)}</span>
            </div>
          </div>
        </div>
      </ContextMenu>

      <PlaybackViewer recording={recording} open={viewerOpen} onOpenChange={setViewerOpen} />
    </>
  );
}
