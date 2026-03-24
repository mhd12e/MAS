import { Injectable, Logger } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { request, IncomingMessage } from 'http';
import type { Response } from 'express';
import { PythonService } from '../python/python.service';
import { DbService } from '../db/db.service';
import { RecordingService } from '../recording/recording.service';
import { EmulatorService } from '../emulator/emulator.service';

interface ActiveRun {
  phoneId: string;
  events: string[];    // buffered SSE "data: ..." lines
  done: boolean;
  clients: Set<Response>;
}

@Injectable()
export class DroidrunService {
  private readonly logger = new Logger(DroidrunService.name);
  private readonly activeRuns = new Map<string, ActiveRun>(); // keyed by phoneId

  constructor(
    private pythonService: PythonService,
    private db: DbService,
    private recordingService: RecordingService,
    private emulatorService: EmulatorService,
  ) {}

  /** Get the active run for a phone (if any) */
  getActiveRun(phoneId: string): ActiveRun | undefined {
    return this.activeRuns.get(phoneId);
  }

  /** Stream prompt — or reconnect to an existing run */
  streamPrompt(phoneId: string, adbPort: number, prompt: string, taskId: string, res: Response): void {
    // If there's already an active run for this phone, reconnect
    const existing = this.activeRuns.get(phoneId);
    if (existing && !existing.done) {
      this.reconnectClient(existing, res);
      return;
    }

    const serial = `emulator-${adbPort}`;

    if (!this.ensureAdb(serial)) {
      this.sendSSE(res, { type: 'error', message: 'Could not connect to phone. Try again.' });
      res.end();
      return;
    }

    const enhancedTask = this.buildPrompt(prompt);

    this.logger.log(`Running on ${serial}: "${prompt}"`);

    // Start recording the phone screen
    const instance = this.emulatorService.findOne(phoneId);
    if (instance) {
      this.recordingService.startRecording(phoneId, taskId, instance.displayNum);
    }

    // Create active run
    const run: ActiveRun = { phoneId, events: [], done: false, clients: new Set() };
    this.activeRuns.set(phoneId, run);

    // Set up the initial client
    this.setupSSEClient(res, run);

    // Start the FastAPI request
    const body = JSON.stringify({ task: enhancedTask, device_serial: serial });

    const fastapiReq = request(
      {
        hostname: this.pythonService.host,
        port: this.pythonService.port,
        path: '/run',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'text/event-stream',
        },
      },
      (fastapiRes: IncomingMessage) => {
        fastapiRes.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          // Buffer the event
          run.events.push(data);
          // Broadcast to all connected clients
          for (const client of run.clients) {
            try { client.write(data); } catch {}
          }
        });

        fastapiRes.on('end', () => {
          run.done = true;
          // Stop recording
          this.recordingService.stopRecording(phoneId);

          for (const client of run.clients) {
            try { client.end(); } catch {}
          }
          run.clients.clear();
          setTimeout(() => {
            if (this.activeRuns.get(phoneId) === run) {
              this.activeRuns.delete(phoneId);
            }
          }, 60_000);
        });

        fastapiRes.on('error', () => {
          const errEvent = `data: ${JSON.stringify({ type: 'error', message: 'Lost connection to agent.' })}\n\n`;
          run.events.push(errEvent);
          run.done = true;
          this.recordingService.stopRecordingWithError(phoneId);
          for (const client of run.clients) {
            try { client.write(errEvent); client.end(); } catch {}
          }
          run.clients.clear();
        });
      },
    );

    fastapiReq.on('error', () => {
      const errEvent = `data: ${JSON.stringify({ type: 'error', message: 'Could not reach agent service.' })}\n\n`;
      run.events.push(errEvent);
      run.done = true;
      for (const client of run.clients) {
        try { client.write(errEvent); client.end(); } catch {}
      }
      run.clients.clear();
    });

    // Do NOT destroy the request on client disconnect — the agent keeps running
    fastapiReq.write(body);
    fastapiReq.end();
  }

  /** Reconnect a client to an in-progress or recently-finished run */
  reconnectClient(run: ActiveRun, res: Response): void {
    this.setupSSEClient(res, run);

    // Replay all buffered events
    for (const event of run.events) {
      try { res.write(event); } catch {}
    }

    // If already done, close immediately
    if (run.done) {
      res.end();
      return;
    }

    // Otherwise the client will receive new events via the broadcast in streamPrompt
  }

  /** Check if a phone has an active run */
  isRunning(phoneId: string): boolean {
    const run = this.activeRuns.get(phoneId);
    return !!run && !run.done;
  }

  async getSuggestions(): Promise<string[]> {
    try {
      const r = await fetch(`http://${this.pythonService.host}:${this.pythonService.port}/suggestions`);
      return await r.json();
    } catch {
      return ['Open Chrome and search for cute cats', 'Go to Settings and enable dark mode'];
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private setupSSEClient(res: Response, run: ActiveRun): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay(true);
    res.flushHeaders();
    res.write(':ok\n\n');

    run.clients.add(res);

    // Remove client on disconnect but DON'T kill the agent
    res.on('close', () => {
      run.clients.delete(res);
    });
  }

  private sendSSE(res: Response, data: object): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private ensureAdb(serial: string): boolean {
    for (let i = 0; i < 3; i++) {
      try {
        const r = execFileSync('adb', ['-s', serial, 'shell', 'echo', 'ok'], {
          timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        }).toString().trim();
        if (r === 'ok') return true;
      } catch {}
      if (i < 2) {
        try { execFileSync('adb', ['kill-server'], { timeout: 3000, stdio: 'pipe' }); } catch {}
        try { execFileSync('adb', ['start-server'], { timeout: 5000, stdio: 'pipe' }); } catch {}
      }
    }
    return false;
  }

  private buildPrompt(prompt: string): string {
    return [
      'You are controlling an Android phone on behalf of a user.',
      `The user wants you to: ${prompt}`,
      '',
      '=== MANDATORY RULES — YOU MUST FOLLOW THESE ===',
      '',
      'RULE 1 — ALWAYS WAIT AFTER ACTIONS:',
      'After EVERY action (click, type, swipe, open_app), you MUST call wait(3.0) before doing anything else.',
      'The phone is a slow emulator. If you skip waiting, you will see stale/empty UI state and fail.',
      '',
      'RULE 2 — NEVER GIVE UP ON MISSING UI STATE:',
      'If you cannot see the expected screen elements after an action:',
      '  1. Call wait(4.0)',
      '  2. Try the action again',
      '  3. Call wait(4.0) again',
      '  4. Only after 3 failed attempts with waits between each, consider an alternative approach',
      'YOU ARE ABSOLUTELY FORBIDDEN from calling complete(success=false) just because you "don\'t have UI state".',
      'The UI state WILL arrive if you wait. You have 50 steps — use them.',
      '',
      'RULE 3 — NEVER FAIL ON FIRST ATTEMPT:',
      'You must retry every failed action at least 3 times with wait(3.0) between each attempt.',
      '',
      'RULE 4 — VERIFICATION:',
      'Before calling complete(), always wait(2.0) and verify the final screen state.',
      'If you set a value, confirm it matches exactly what was requested.',
      '',
      'RULE 5 — REPORT YOUR FINDINGS:',
      'The user CANNOT see the phone screen. They only see your text responses.',
      'When you find information, you MUST include the EXACT information in your completion message.',
      'BAD: "Successfully checked the Android version."',
      'GOOD: "The Android version is 14 (API level 34). Build number: UPB5.230623.006."',
      'Always state what you found, not just that you found it.',
      '',
      'RULE 6 — GENERAL:',
      '- Complete the task fully, do not stop halfway.',
      '- If an app is not open, open it first.',
      '- If you encounter a login screen, stop and report it.',
      '- Keep your prompts short. Do ONE action per step, then wait and verify.',
    ].join('\n');
  }
}
