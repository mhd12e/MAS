import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContextMenu } from '@/components/ui/context-menu';
import { Plus, MessageSquare, Pin, Pencil, Trash2, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/stores/app-store';
import type { Task } from '@/types';

interface TaskListProps {
  tasks: Task[];
  activeTaskId: string | null;
  onSelectTask: (id: string) => void;
  onNewTask: () => void;
}

export function TaskList({ tasks, activeTaskId, onSelectTask, onNewTask }: TaskListProps) {
  const { pinTask, renameTask, deleteTask } = useApp();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Sort: pinned first, then by creation date (newest first)
  const sorted = [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  const startRename = (task: Task) => {
    setRenamingId(task.id);
    setRenameValue(task.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameTask(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={onNewTask}>
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No tasks yet. Create one to start controlling this phone.
            </p>
          ) : (
            sorted.map((task) => {
              const lastMsg = task.messages[task.messages.length - 1];
              const isActive = task.id === activeTaskId;
              const isStreaming = lastMsg?.status === 'streaming';

              return (
                <ContextMenu
                  key={task.id}
                  items={[
                    {
                      label: task.pinned ? 'Unpin' : 'Pin to top',
                      icon: task.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />,
                      onClick: () => pinTask(task.id, !task.pinned),
                    },
                    {
                      label: 'Rename',
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      onClick: () => startRename(task),
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      onClick: () => deleteTask(task.id),
                      variant: 'destructive',
                    },
                  ]}
                >
                  <button
                    onClick={() => onSelectTask(task.id)}
                    className={cn(
                      'w-full text-left p-2.5 rounded-md transition-colors text-sm',
                      isActive
                        ? 'bg-sidebar-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {renamingId === task.id ? (
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                        onBlur={commitRename}
                        autoFocus
                        className="h-6 text-xs px-1.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex items-start gap-2">
                        {task.pinned ? (
                          <Pin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{task.title}</p>
                          {isStreaming && (
                            <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                              <span className="inline-block h-1 w-1 rounded-full bg-primary animate-pulse" />
                              Working...
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                </ContextMenu>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
