import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '@/stores/app-store';
import { apiFetch } from '@/lib/api';
import { TaskList } from './task-list';
import { ChatPanel } from './chat-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Trash2, Pencil } from 'lucide-react';

export function PhoneDetailPage() {
  const { phoneId } = useParams<{ phoneId: string }>();
  const navigate = useNavigate();
  const { phones, tasks, removePhone, renamePhone, reconnectStream } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState('');

  // On mount, check if there's an active agent run to reconnect to
  useEffect(() => {
    if (phoneId) reconnectStream(phoneId);
  }, [phoneId, reconnectStream]);

  const phone = phones.find((p) => p.id === phoneId);
  const phoneTasks = useMemo(
    () => tasks.filter((t) => t.phoneId === phoneId).sort((a, b) => b.createdAt - a.createdAt),
    [tasks, phoneId],
  );

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTask = phoneTasks.find((t) => t.id === activeTaskId) ?? null;

  // Determine if any task is actively streaming (local state OR backend state)
  const [backendRunning, setBackendRunning] = useState(false);
  const localStreaming = phoneTasks.some((t) => t.messages.some((m) => m.status === 'streaming'));
  const hasWorkingTask = localStreaming || backendRunning;

  // Poll backend running state to survive refresh
  useEffect(() => {
    if (!phoneId) return;
    const check = () => {
      apiFetch(`/phones/${phoneId}/agent/status`)
        .then((r) => r.json())
        .then(({ running }) => setBackendRunning(running))
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [phoneId]);

  if (!phone) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 text-muted-foreground">
        <p>Phone not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const novncUrl = `http://localhost:${phone.novncPort}/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=${hasWorkingTask}`;

  const handleRemove = async () => {
    await removePhone(phone.id);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border" />
          {renaming ? (
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { renamePhone(phone.id, nameValue); setRenaming(false); }
                if (e.key === 'Escape') setRenaming(false);
              }}
              onBlur={() => { renamePhone(phone.id, nameValue); setRenaming(false); }}
              autoFocus
              className="h-7 text-sm px-2 w-40"
            />
          ) : (
            <h1
              className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => { setNameValue(phone.name); setRenaming(true); }}
              title="Click to rename"
            >
              {phone.name}
            </h1>
          )}
          <StatusBadge status={hasWorkingTask ? 'working' : phone.status} />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => { setNameValue(phone.name); setRenaming(true); }}
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            title="Remove phone"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Phone screen */}
        <div className="w-[340px] flex-shrink-0 border-r border-border bg-black">
          {phone.status === 'ready' ? (
            <iframe
              src={novncUrl}
              className="w-full h-full border-0"
              title={phone.name}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {phone.status === 'booting' ? 'Booting...' : 'Unavailable'}
            </div>
          )}
        </div>

        {/* Middle: Task list */}
        <div className="w-[220px] flex-shrink-0 border-r border-border bg-card">
          <TaskList
            tasks={phoneTasks}
            activeTaskId={activeTaskId}
            onSelectTask={setActiveTaskId}
            onNewTask={() => setActiveTaskId(null)}
          />
        </div>

        {/* Right: Chat */}
        <div className="flex-1 min-w-0 min-h-0">
          <ChatPanel
            task={activeTask}
            phoneId={phone.id}
            onTaskCreated={(id) => setActiveTaskId(id)}
          />
        </div>
      </div>
    </div>
  );
}
