import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Loader2, CheckCircle2, AlertCircle, Info, ArrowRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/stores/app-store';
import { PlaybackViewer } from '@/components/ui/playback-viewer';
import { API_BASE } from '@/config';
import type { Task, StepEvent, ChatMessage } from '@/types';

interface ChatPanelProps {
  task: Task | null;
  phoneId: string;
  onTaskCreated?: (taskId: string) => void;
}

export function ChatPanel({ task, phoneId, onTaskCreated }: ChatPanelProps) {
  const { createTask, runTask } = useApp();
  const [prompt, setPrompt] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const isStreaming = task?.messages.some((m) => m.status === 'streaming');

  // Auto-scroll on new messages/steps
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [task?.messages]);

  const handleSend = async () => {
    if (!prompt.trim() || isStreaming) return;
    const text = prompt.trim();
    setPrompt('');

    const newTask = await createTask(phoneId, text);
    onTaskCreated?.(newTask.id);
    runTask(newTask);
  };

  if (!task) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Tell this phone what to do
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="flex gap-2">
              <Input
                placeholder="Open Chrome and search for..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="bg-input"
              />
              <Button size="icon" onClick={handleSend} disabled={!prompt.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat messages */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {task.messages.map((msg) => (
            <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'user' ? (
                <div className="bg-primary/10 text-foreground rounded-lg px-3.5 py-2 max-w-[80%] text-sm">
                  {msg.content}
                </div>
              ) : (
                <AgentMessage msg={msg} taskId={task.id} />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            placeholder="Send another instruction..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isStreaming}
            className="bg-input"
          />
          <Button size="icon" onClick={handleSend} disabled={isStreaming || !prompt.trim()}>
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentMessage({ msg, taskId }: { msg: ChatMessage; taskId: string }) {
  const { recordings } = useApp();
  const [viewerOpen, setViewerOpen] = useState(false);
  const steps = msg.steps || [];
  const progressSteps = steps.filter((s) => s.type !== 'done' && s.type !== 'error');
  const finalStep = steps.find((s) => s.type === 'done' || s.type === 'error');
  const isStreaming = msg.status === 'streaming';

  // Find recording for this task
  const recording = recordings.find((r) => r.taskId === taskId && r.status === 'done');
  const videoUrl = recording ? `${API_BASE}/recordings/${recording.id}/video` : null;

  return (
    <div className="w-full max-w-[90%] space-y-2">
      {progressSteps.length > 0 && (
        <div className="space-y-0.5">
          {progressSteps.map((step, i) => (
            <StepLine key={i} step={step} />
          ))}
        </div>
      )}

      {isStreaming && steps.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting to agent...
        </div>
      )}
      {isStreaming && steps.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-primary py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Working...
        </div>
      )}

      {/* Final result card with video */}
      {finalStep && (
        <div className={cn(
          'rounded-lg border mt-2 overflow-hidden',
          finalStep.type === 'done'
            ? 'border-success/20 bg-success/5'
            : 'border-destructive/20 bg-destructive/5'
        )}>
          {/* Video preview in result card */}
          {videoUrl && (
            <div
              className="relative bg-black cursor-pointer group/video border-b border-border/10"
              style={{ height: 160 }}
              onClick={() => setViewerOpen(true)}
            >
              <video src={videoUrl} className="w-full h-full object-contain" muted preload="metadata" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/video:bg-black/40 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm group-hover/video:scale-110 transition-transform">
                  <Play className="h-4 w-4 text-white ml-0.5" />
                </div>
              </div>
            </div>
          )}

          <div className="p-3">
            <div className="flex items-start gap-2.5">
              {finalStep.type === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={cn(
                  'text-sm font-medium mb-0.5',
                  finalStep.type === 'done' ? 'text-success' : 'text-destructive'
                )}>
                  {finalStep.type === 'done' ? 'Task Complete' : 'Task Failed'}
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {finalStep.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {recording && (
        <PlaybackViewer recording={recording} open={viewerOpen} onOpenChange={setViewerOpen} />
      )}
    </div>
  );
}

function StepLine({ step }: { step: StepEvent }) {
  const Icon = step.type === 'info' ? Info : ArrowRight;

  return (
    <div className="flex items-start gap-2 py-0.5">
      <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {step.message}
      </p>
    </div>
  );
}
