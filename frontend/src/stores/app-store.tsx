import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { EmulatorInfo, Task, ChatMessage, StepEvent, Recording } from '@/types';
import { apiFetch } from '@/lib/api';

interface AppState {
  phones: EmulatorInfo[];
  tasks: Task[];
  recordings: Recording[];
  loading: boolean;
  backendUp: boolean;
  toasts: { id: number; text: string }[];
  addPhone: () => Promise<void>;
  removePhone: (id: string) => Promise<void>;
  renamePhone: (id: string, name: string) => Promise<void>;
  createTask: (phoneId: string, prompt: string) => Promise<Task>;
  runTask: (task: Task) => void;
  pinTask: (id: string, pinned: boolean) => void;
  renameTask: (id: string, title: string) => void;
  deleteTask: (id: string) => void;
  reconnectStream: (phoneId: string) => void;
  refreshRecordings: () => void;
  deleteRecording: (id: string) => void;
  addToast: (text: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phones, setPhones] = useState<EmulatorInfo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendUp, setBackendUp] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastId = useRef(0);
  const taskIdRef = useRef(0);

  const addToast = useCallback((text: string) => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Poll phones
  const fetchPhones = useCallback(async () => {
    try {
      const res = await apiFetch(`/phones`);
      if (!res.ok) { setBackendUp(false); return; }
      setBackendUp(true);
      const data: EmulatorInfo[] = await res.json();

      setPhones((prev) => {
        for (const emu of data) {
          const old = prev.find((p) => p.id === emu.id);
          if (old?.status === 'booting' && emu.status === 'ready') {
            addToast(`${emu.name} is ready`);
          }
        }
        return data;
      });
    } catch {
      setBackendUp(false);
    }
  }, [addToast]);

  const refreshRecordings = useCallback(() => {
    apiFetch(`/recordings`)
      .then((r) => r.json())
      .then((data: Recording[]) => setRecordings(data))
      .catch(() => {});
  }, []);

  const deleteRecording = useCallback((id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    apiFetch(`/recordings/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  // Load tasks and recordings from backend on mount
  useEffect(() => {
    refreshRecordings();
  }, [refreshRecordings]);

  useEffect(() => {
    apiFetch(`/tasks`)
      .then((r) => r.json())
      .then((data: any[]) => {
        const loaded: Task[] = data.map((t) => ({
          id: t.id,
          phoneId: t.phoneId,
          title: t.title,
          pinned: t.pinned || false,
          createdAt: new Date(t.createdAt).getTime(),
          messages: (t.messages || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            status: 'done' as const,
            timestamp: new Date(m.timestamp).getTime(),
            steps: m.steps?.map((s: any) => ({ type: (s.type || 'step') as 'step' | 'done' | 'error' | 'info', message: s.step, timestamp: s.timestamp })),
          })),
        }));
        setTasks(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPhones();
    const interval = setInterval(fetchPhones, 5000);
    return () => clearInterval(interval);
  }, [fetchPhones]);

  const addPhone = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/phones`, { method: 'POST' });
      if (res.ok) {
        const emu = await res.json();
        setPhones((prev) => prev.some((e) => e.id === emu.id) ? prev : [...prev, emu]);
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Could not start phone');
      }
    } catch {
      addToast('Could not start phone');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const removePhone = useCallback(async (id: string) => {
    setPhones((prev) => prev.map((e) => e.id === id ? { ...e, status: 'stopping' as const } : e));
    try {
      await apiFetch(`/phones/${id}`, { method: 'DELETE' });
    } catch {}
    setPhones((prev) => prev.filter((e) => e.id !== id));
    setTasks((prev) => prev.filter((t) => t.phoneId !== id));
    addToast('Phone removed');
  }, [addToast]);

  const renamePhone = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPhones((prev) => prev.map((e) => e.id === id ? { ...e, name: trimmed } : e));
    // Await the PATCH so the backend has the new name before the next poll
    try {
      await apiFetch(`/phones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {}
  }, []);

  const createTask = useCallback(async (phoneId: string, prompt: string): Promise<Task> => {
    const title = prompt.slice(0, 60) + (prompt.length > 60 ? '...' : '');

    // Persist to backend
    let taskId = `task-${taskIdRef.current++}`;
    try {
      const res = await apiFetch(`/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneId, title }),
      });
      if (res.ok) {
        const saved = await res.json();
        taskId = saved.id;
      }
    } catch {}

    const task: Task = { id: taskId, phoneId, title, pinned: false, messages: [], createdAt: Date.now() };
    setTasks((prev) => [...prev, task]);
    return task;
  }, []);

  const runTask = useCallback((task: Task) => {
    const userPrompt = task.title;
    const msgId = `msg-${Date.now()}`;
    const now = new Date().toISOString();

    const userMsg: ChatMessage = {
      id: msgId,
      role: 'user',
      content: userPrompt,
      status: 'done',
      timestamp: Date.now(),
    };

    const agentMsgId = `msg-${Date.now() + 1}`;
    const agentMsg: ChatMessage = {
      id: agentMsgId,
      role: 'agent',
      content: '',
      steps: [],
      status: 'streaming',
      timestamp: Date.now(),
    };

    setTasks((prev) => prev.map((t) =>
      t.id === task.id
        ? { ...t, messages: [...t.messages, userMsg, agentMsg] }
        : t
    ));

    // Persist user message to backend
    apiFetch(`/tasks/${task.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msgId, role: 'user', content: userPrompt, timestamp: now }),
    }).catch(() => {});

    // Persist empty agent message (will be updated with steps)
    apiFetch(`/tasks/${task.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agentMsgId, role: 'agent', content: '', timestamp: now, steps: [] }),
    }).catch(() => {});

    // Stream from backend
    (async () => {
      try {
        const res = await apiFetch(`/phones/${task.phoneId}/agent/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt, taskId: task.id }),
        });

        if (!res.ok || !res.body) {
          updateAgentMsg(task.id, agentMsgId, { status: 'error', content: 'Could not reach agent.' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const seenMsgs = new Set<string>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event: StepEvent = JSON.parse(line.slice(6));
              if (seenMsgs.has(event.message)) continue;
              seenMsgs.add(event.message);

              setTasks((prev) => prev.map((t) => {
                if (t.id !== task.id) return t;
                return {
                  ...t,
                  messages: t.messages.map((m) => {
                    if (m.id !== agentMsgId) return m;
                    const steps = [...(m.steps || []), event];
                    const content = event.type === 'done'
                      ? event.message
                      : event.type === 'error'
                        ? event.message
                        : m.content;
                    const status = event.type === 'done' ? 'done' as const
                      : event.type === 'error' ? 'error' as const
                        : 'streaming' as const;
                    return { ...m, steps, content, status };
                  }),
                };
              }));
            } catch {}
          }
        }

        // Ensure final status and persist to backend
        setTasks((prev) => {
          const t = prev.find((x) => x.id === task.id);
          const agentMsg = t?.messages.find((m) => m.id === agentMsgId);
          if (agentMsg) {
            // Persist final agent message with all steps
            apiFetch(`/tasks/${task.id}/messages/${agentMsgId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: agentMsg.content,
                steps: agentMsg.steps?.map((s) => ({ type: s.type, step: s.message, timestamp: s.timestamp || new Date().toISOString() })),
              }),
            }).catch(() => {});
          }
          // Refresh recordings after task completes (recording saved)
          setTimeout(() => refreshRecordings(), 3000);

          return prev.map((t) => {
            if (t.id !== task.id) return t;
            return {
              ...t,
              messages: t.messages.map((m) => {
                if (m.id !== agentMsgId || m.status === 'done' || m.status === 'error') return m;
                return { ...m, status: 'done' };
              }),
            };
          });
        });
      } catch {
        updateAgentMsg(task.id, agentMsgId, { status: 'error', content: 'Connection lost.' });
      }
    })();
  }, []);

  function updateAgentMsg(taskId: string, msgId: string, updates: Partial<ChatMessage>) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        messages: t.messages.map((m) => m.id === msgId ? { ...m, ...updates } : m),
      };
    }));
  }

  const reconnectStream = useCallback((phoneId: string) => {
    // Check if this phone has an active agent run on the backend
    apiFetch(`/phones/${phoneId}/agent/status`)
      .then((r) => r.json())
      .then(({ running }: { running: boolean }) => {
        if (!running) return;

        // Find the most recent task for this phone that has a streaming message
        // or create a placeholder to show the reconnected stream
        const phoneTasks = tasks.filter((t) => t.phoneId === phoneId);
        const latestTask = phoneTasks[phoneTasks.length - 1];

        const agentMsgId = `msg-reconnect-${Date.now()}`;

        if (latestTask) {
          // Check if last message is already streaming
          const lastMsg = latestTask.messages[latestTask.messages.length - 1];
          if (lastMsg?.status === 'streaming') return; // already connected

          // Add a reconnect agent message
          setTasks((prev) => prev.map((t) => {
            if (t.id !== latestTask.id) return t;
            return {
              ...t,
              messages: [...t.messages, {
                id: agentMsgId,
                role: 'agent' as const,
                content: '',
                steps: [],
                status: 'streaming' as const,
                timestamp: Date.now(),
              }],
            };
          }));
        }

        // Connect to the SSE stream to get live events
        apiFetch(`/phones/${phoneId}/agent/stream`)
          .then(async (res) => {
            if (!res.ok || !res.body) return;
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const seen = new Set<string>();
            const targetTaskId = latestTask?.id;
            if (!targetTaskId) return;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  if (seen.has(event.message)) continue;
                  seen.add(event.message);

                  setTasks((prev) => prev.map((t) => {
                    if (t.id !== targetTaskId) return t;
                    return {
                      ...t,
                      messages: t.messages.map((m) => {
                        if (m.id !== agentMsgId) return m;
                        const steps = [...(m.steps || []), event];
                        const status = event.type === 'done' ? 'done' as const
                          : event.type === 'error' ? 'error' as const
                            : 'streaming' as const;
                        return { ...m, steps, content: event.type === 'done' || event.type === 'error' ? event.message : m.content, status };
                      }),
                    };
                  }));
                } catch {}
              }
            }

            // Mark done
            setTasks((prev) => prev.map((t) => {
              if (t.id !== targetTaskId) return t;
              return {
                ...t,
                messages: t.messages.map((m) => {
                  if (m.id !== agentMsgId || m.status === 'done' || m.status === 'error') return m;
                  return { ...m, status: 'done' as const };
                }),
              };
            }));
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, [tasks]);

  const pinTask = useCallback((id: string, pinned: boolean) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, pinned } : t));
    apiFetch(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    }).catch(() => {});
  }, []);

  const renameTask = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, title: trimmed } : t));
    apiFetch(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {});
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    apiFetch(`/tasks/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  return (
    <AppContext.Provider value={{
      phones, tasks, recordings, loading, backendUp, toasts,
      addPhone, removePhone, renamePhone, createTask, runTask,
      pinTask, renameTask, deleteTask, reconnectStream,
      refreshRecordings, deleteRecording, addToast,
    }}>
      {children}
    </AppContext.Provider>
  );
}
