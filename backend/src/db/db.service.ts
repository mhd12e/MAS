import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  existsSync, readFileSync, writeFileSync, renameSync, mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import type { DbSchema, DbPhone, DbTask, DbMessage, DbStepEntry, DbRecording, DbUser, DbApiKey } from './db.types';
import { EMPTY_DB } from './db.types';

const DB_PATH = join(process.cwd(), '..', 'data', 'db.json');
const TMP_PATH = DB_PATH + '.tmp';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  private data: DbSchema = { ...EMPTY_DB, phones: [], tasks: [] };
  private writeQueue: Promise<void> = Promise.resolve();

  onModuleInit() {
    this.load();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getPhones(): DbPhone[] {
    return this.data.phones;
  }

  getPhone(id: string): DbPhone | undefined {
    return this.data.phones.find((p) => p.id === id);
  }

  getTasksForPhone(phoneId: string): DbTask[] {
    return this.data.tasks.filter((t) => t.phoneId === phoneId);
  }

  getAllTasks(): DbTask[] {
    return this.data.tasks;
  }

  getTask(id: string): DbTask | undefined {
    return this.data.tasks.find((t) => t.id === id);
  }

  // ── Write: Phones ─────────────────────────────────────────────────────────

  addPhone(phone: DbPhone): void {
    this.data.phones.push(phone);
    this.persist();
  }

  updatePhone(id: string, updates: Partial<Pick<DbPhone, 'name'>>): void {
    const phone = this.data.phones.find((p) => p.id === id);
    if (!phone) return;
    if (updates.name !== undefined) phone.name = updates.name;
    this.persist();
  }

  removePhone(id: string): void {
    this.data.phones = this.data.phones.filter((p) => p.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.phoneId !== id);
    this.data.recordings = this.data.recordings.filter((r) => r.phoneId !== id);
    this.persist();
  }

  // ── Write: Tasks ──────────────────────────────────────────────────────────

  addTask(task: DbTask): void {
    this.data.tasks.push(task);
    this.persist();
  }

  updateTask(id: string, updates: Partial<Pick<DbTask, 'title' | 'pinned'>>): void {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) return;
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.pinned !== undefined) task.pinned = updates.pinned;
    this.persist();
  }

  removeTask(id: string): void {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    this.data.recordings = this.data.recordings.filter((r) => r.taskId !== id);
    this.persist();
  }

  addMessage(taskId: string, message: DbMessage): void {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.messages.push(message);
    this.persist();
  }

  updateMessage(taskId: string, messageId: string, updates: Partial<DbMessage>): void {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const msg = task.messages.find((m) => m.id === messageId);
    if (!msg) return;
    Object.assign(msg, updates);
    this.persist();
  }

  appendSteps(taskId: string, messageId: string, steps: DbStepEntry[]): void {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const msg = task.messages.find((m) => m.id === messageId);
    if (!msg) return;
    if (!msg.steps) msg.steps = [];
    msg.steps.push(...steps);
    this.persist();
  }

  // ── Write: Recordings ────────────────────────────────────────────────────

  getRecordings(): DbRecording[] {
    return this.data.recordings;
  }

  getRecording(id: string): DbRecording | undefined {
    return this.data.recordings.find((r) => r.id === id);
  }

  getRecordingsForPhone(phoneId: string): DbRecording[] {
    return this.data.recordings.filter((r) => r.phoneId === phoneId);
  }

  addRecording(rec: DbRecording): void {
    this.data.recordings.push(rec);
    this.persist();
  }

  updateRecording(id: string, updates: Partial<Pick<DbRecording, 'status' | 'durationSecs'>>): void {
    const rec = this.data.recordings.find((r) => r.id === id);
    if (!rec) return;
    if (updates.status !== undefined) rec.status = updates.status;
    if (updates.durationSecs !== undefined) rec.durationSecs = updates.durationSecs;
    this.persist();
  }

  removeRecording(id: string): void {
    this.data.recordings = this.data.recordings.filter((r) => r.id !== id);
    this.persist();
  }

  // ── Read/Write: Users ────────────────────────────────────────────────────

  getUsers(): DbUser[] { return this.data.users; }
  getUserByEmail(email: string): DbUser | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }
  getUserById(id: string): DbUser | undefined {
    return this.data.users.find((u) => u.id === id);
  }
  addUser(user: DbUser): void { this.data.users.push(user); this.persist(); }
  hasAnyUser(): boolean { return this.data.users.length > 0; }

  // ── Read/Write: API Keys ────────────────────────────────────────────────

  getApiKeys(): DbApiKey[] { return this.data.apiKeys; }
  getApiKeyById(id: string): DbApiKey | undefined {
    return this.data.apiKeys.find((k) => k.id === id);
  }
  findApiKeyByHash(hash: string): DbApiKey | undefined {
    return this.data.apiKeys.find((k) => k.keyHash === hash);
  }
  addApiKey(key: DbApiKey): void { this.data.apiKeys.push(key); this.persist(); }
  updateApiKeyLastUsed(id: string): void {
    const key = this.data.apiKeys.find((k) => k.id === id);
    if (key) { key.lastUsedAt = new Date().toISOString(); this.persist(); }
  }
  removeApiKey(id: string): void {
    this.data.apiKeys = this.data.apiKeys.filter((k) => k.id !== id);
    this.persist();
  }

  // ── File I/O ──────────────────────────────────────────────────────────────

  private load(): void {
    if (!existsSync(DB_PATH)) {
      this.logger.log('No db.json found — starting fresh');
      mkdirSync(dirname(DB_PATH), { recursive: true });
      this.save();
      return;
    }

    try {
      const raw = readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);

      // Basic validation
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.phones)) {
        throw new Error('Invalid schema');
      }

      this.data = {
        version: parsed.version || 1,
        users: parsed.users || [],
        apiKeys: parsed.apiKeys || [],
        phones: parsed.phones || [],
        tasks: parsed.tasks || [],
        recordings: parsed.recordings || [],
      };

      this.logger.log(`Loaded db.json: ${this.data.phones.length} phones, ${this.data.tasks.length} tasks, ${this.data.recordings.length} recordings`);
    } catch (err) {
      this.logger.error('Failed to load db.json — backing up and starting fresh:', err);
      // Backup corrupted file
      try {
        const backupPath = DB_PATH + '.backup.' + Date.now();
        renameSync(DB_PATH, backupPath);
        this.logger.warn(`Backed up corrupted db.json to ${backupPath}`);
      } catch {}
      this.data = { ...EMPTY_DB, phones: [], tasks: [] };
      this.save();
    }
  }

  /** Queue a write to prevent interleaving */
  private persist(): void {
    this.writeQueue = this.writeQueue.then(() => this.save()).catch((err) => {
      this.logger.error('Failed to persist db.json:', err);
    });
  }

  /** Atomic write: tmp file → rename */
  private save(): void {
    try {
      mkdirSync(dirname(DB_PATH), { recursive: true });
      const json = JSON.stringify(this.data, null, 2);
      writeFileSync(TMP_PATH, json, 'utf-8');
      renameSync(TMP_PATH, DB_PATH);
    } catch (err) {
      this.logger.error('Atomic write failed:', err);
    }
  }
}
