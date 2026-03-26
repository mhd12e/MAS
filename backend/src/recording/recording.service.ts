import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { DbService } from '../db/db.service';
import type { DbRecording } from '../db/db.types';

const RECORDINGS_DIR = join(process.cwd(), '..', 'data', 'recordings');

@Injectable()
export class RecordingService implements OnModuleInit {
  private readonly logger = new Logger(RecordingService.name);
  private readonly activeRecordings = new Map<string, { proc: ChildProcess; startTime: number; recordingId: string; exited: boolean }>();

  constructor(private db: DbService) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  onModuleInit() {
    this.cleanupOrphaned();
  }

  /** Remove recordings whose phone no longer exists, and files with no DB entry */
  private cleanupOrphaned() {
    const phoneIds = new Set(this.db.getPhones().map((p) => p.id));
    const dbFilenames = new Set(this.db.getRecordings().map((r) => r.filename));

    // Remove DB recordings whose phone is gone
    for (const rec of this.db.getRecordings()) {
      if (!phoneIds.has(rec.phoneId)) {
        this.deleteRecordingFile(rec.filename);
        this.db.removeRecording(rec.id);
        this.logger.log(`Cleaned up orphaned recording: ${rec.id} (phone ${rec.phoneId} gone)`);
      }
    }

    // Remove recording files with no DB entry
    try {
      for (const file of readdirSync(RECORDINGS_DIR)) {
        if (file.endsWith('.mp4') && !dbFilenames.has(file)) {
          rmSync(join(RECORDINGS_DIR, file));
          this.logger.log(`Cleaned up orphaned file: ${file}`);
        }
      }
    } catch {}

    // Mark any "recording" status entries as "error" (interrupted by restart)
    for (const rec of this.db.getRecordings()) {
      if (rec.status === 'recording') {
        this.db.updateRecording(rec.id, { status: 'error' });
        this.logger.log(`Marked interrupted recording as error: ${rec.id}`);
      }
    }
  }

  /** Start recording a phone's display */
  startRecording(phoneId: string, taskId: string, displayNum: number): string {
    // Don't start if already recording this phone
    if (this.activeRecordings.has(phoneId)) {
      this.logger.warn(`Already recording ${phoneId}`);
      return this.activeRecordings.get(phoneId)!.recordingId;
    }

    const recordingId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const filename = `${recordingId}.mp4`;
    const filepath = join(RECORDINGS_DIR, filename);

    // Create DB entry
    const rec: DbRecording = {
      id: recordingId,
      taskId,
      phoneId,
      filename,
      durationSecs: 0,
      status: 'recording',
      createdAt: new Date().toISOString(),
    };
    this.db.addRecording(rec);

    // Build ffmpeg env — must unset WAYLAND for x11grab
    const env: Record<string, string> = { ...process.env as any };
    delete env.WAYLAND_DISPLAY;
    env.DISPLAY = `:${displayNum}`;

    // Start ffmpeg x11grab — capture the Xvfb display
    // Use fragmented MP4 so the file is playable even if ffmpeg is killed abruptly
    const proc = spawn('ffmpeg', [
      '-f', 'x11grab',
      '-video_size', '320x650',
      '-framerate', '15',
      '-i', `:${displayNum}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-movflags', 'frag_keyframe+empty_moov',
      '-y',
      filepath,
    ], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stderr?.on('data', () => {}); // drain stderr to prevent buffer overflow

    const entry = { proc, startTime: Date.now(), recordingId, exited: false };
    proc.on('exit', (code) => {
      entry.exited = true;
      this.logger.log(`Recording ${recordingId} ffmpeg exited with code ${code}`);
    });

    this.activeRecordings.set(phoneId, entry);
    this.logger.log(`Started recording ${recordingId} for ${phoneId} on :${displayNum}`);

    return recordingId;
  }

  /** Stop recording a phone — waits for ffmpeg to finalize the MP4 */
  async stopRecording(phoneId: string): Promise<void> {
    await this.stopRecordingInternal(phoneId, 'done');
  }

  /** Stop with error status — still waits for ffmpeg to finalize */
  async stopRecordingWithError(phoneId: string): Promise<void> {
    await this.stopRecordingInternal(phoneId, 'done');
  }

  /** Internal: gracefully stop ffmpeg and wait for it to exit */
  private async stopRecordingInternal(phoneId: string, status: 'done' | 'error'): Promise<void> {
    const active = this.activeRecordings.get(phoneId);
    if (!active) return;

    const { proc, startTime, recordingId, exited } = active;
    const durationSecs = Math.round((Date.now() - startTime) / 1000);
    this.activeRecordings.delete(phoneId);

    // If ffmpeg already exited, just update DB
    if (exited) {
      this.db.updateRecording(recordingId, { status, durationSecs });
      this.logger.log(`Recording ${recordingId} already exited (${durationSecs}s, ${status})`);
      return;
    }

    // Wait for ffmpeg to exit after sending quit command
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      proc.on('exit', done);
      proc.on('error', done);

      // Send 'q' to ffmpeg stdin for graceful shutdown
      try {
        proc.stdin?.write('q');
        proc.stdin?.end();
      } catch {}

      // Fallback: SIGINT after 5s if still alive
      setTimeout(() => {
        if (!proc.killed) {
          try { proc.kill('SIGINT'); } catch {}
        }
      }, 5000);

      // Hard kill + resolve after 10s no matter what
      setTimeout(() => {
        if (!proc.killed) {
          try { proc.kill('SIGKILL'); } catch {}
        }
        done();
      }, 10000);
    });

    this.db.updateRecording(recordingId, { status, durationSecs });
    this.logger.log(`Stopped recording ${recordingId} (${durationSecs}s, ${status})`);
  }

  /** Delete a recording file from disk */
  deleteRecordingFile(filename: string): void {
    const filepath = join(RECORDINGS_DIR, filename);
    try {
      if (existsSync(filepath)) rmSync(filepath);
    } catch {}
  }

  /** Delete all recording files for a phone */
  deleteRecordingsForPhone(phoneId: string): void {
    for (const rec of this.db.getRecordingsForPhone(phoneId)) {
      this.deleteRecordingFile(rec.filename);
    }
  }

  /** Get the recordings directory path */
  getRecordingsDir(): string {
    return RECORDINGS_DIR;
  }

  isRecording(phoneId: string): boolean {
    return this.activeRecordings.has(phoneId);
  }
}
