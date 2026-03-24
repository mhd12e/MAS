export interface EmulatorInfo {
  id: string;
  name: string;
  novncPort: number;
  status: 'booting' | 'ready' | 'error' | 'stopping';
  agentRunning?: boolean;
}

export interface StepEvent {
  type: 'step' | 'done' | 'error' | 'info';
  message: string;
  timestamp?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  steps?: StepEvent[];
  status: 'pending' | 'streaming' | 'done' | 'error';
  timestamp: number;
}

export interface Recording {
  id: string;
  taskId: string;
  phoneId: string;
  phoneName: string;
  taskTitle: string;
  filename: string;
  durationSecs: number;
  status: 'recording' | 'done' | 'error';
  createdAt: string;
}

export interface Task {
  id: string;
  phoneId: string;
  title: string;
  pinned: boolean;
  messages: ChatMessage[];
  createdAt: number;
}
