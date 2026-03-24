import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Smartphone, Clock, Calendar, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface PlaybackViewerProps {
  recording: Recording | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlaybackViewer({ recording, open, onOpenChange }: PlaybackViewerProps) {
  const navigate = useNavigate();
  const { deleteRecording } = useApp();

  if (!recording) return null;

  const videoUrl = `${API_BASE}/recordings/${recording.id}/video`;

  const handleGoToTask = () => {
    onOpenChange(false);
    navigate(`/phone/${recording.phoneId}`);
  };

  const handleDelete = () => {
    deleteRecording(recording.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden bg-card border-border">
        {/* Video */}
        <div className="bg-black">
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full max-h-[60vh] object-contain"
          />
        </div>

        {/* Info */}
        <div className="p-5">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-sm font-semibold text-foreground leading-relaxed">
              {recording.taskTitle}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-3 w-3" />
              {recording.phoneName}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatDuration(recording.durationSecs)}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {formatDate(recording.createdAt)}
            </span>
          </div>

          <Separator className="mb-4 opacity-30" />

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleGoToTask}>
              <ExternalLink className="h-3 w-3" />
              Go to task
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
