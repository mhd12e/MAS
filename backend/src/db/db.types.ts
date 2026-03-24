export interface DbStepEntry {
  type: 'step' | 'done' | 'error' | 'info';
  step: string;
  timestamp: string;
}

export interface DbMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  steps?: DbStepEntry[];
}

export interface DbTask {
  id: string;
  phoneId: string;
  title: string;
  pinned: boolean;
  messages: DbMessage[];
  createdAt: string;
}

export interface DbPhone {
  id: string;
  name: string;
  createdAt: string;
}

export interface DbRecording {
  id: string;
  taskId: string;
  phoneId: string;
  filename: string;
  durationSecs: number;
  status: 'recording' | 'done' | 'error';
  createdAt: string;
}

export interface DbUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface DbApiKey {
  id: string;
  name: string;
  keyHash: string;
  prefix: string; // first 8 chars for display (e.g., "mas_k1a2...")
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DbSchema {
  version: 1;
  users: DbUser[];
  apiKeys: DbApiKey[];
  phones: DbPhone[];
  tasks: DbTask[];
  recordings: DbRecording[];
}

export const EMPTY_DB: DbSchema = {
  version: 1,
  users: [],
  apiKeys: [],
  phones: [],
  tasks: [],
  recordings: [],
};
