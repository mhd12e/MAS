import {
  Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger,
} from '@nestjs/common';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import { get } from 'http';
import { join } from 'path';

@Injectable()
export class PythonService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PythonService.name);
  private proc: ChildProcess | null = null;
  private stopping = false;
  readonly port = 8001;
  readonly host = '127.0.0.1';

  private readonly pythonBin = join(__dirname, '../../python/.venv/bin/python3');
  private readonly scriptPath = join(__dirname, '../../python/main.py');

  async onApplicationBootstrap() {
    await this.start();
  }

  onApplicationShutdown() {
    this.stop();
  }

  private async start() {
    this.stopping = false;

    // Kill any leftover process on the port
    try {
      execFileSync('fuser', ['-k', `${this.port}/tcp`], { stdio: 'pipe', timeout: 3000 });
      await new Promise((r) => setTimeout(r, 500));
    } catch {}

    this.logger.log('Starting FastAPI DroidRun service...');

    this.proc = spawn(this.pythonBin, [this.scriptPath], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && (msg.includes('[AGENT ERROR]') || msg.includes('[AGENT EXCEPTION]'))) {
        this.logger.error(msg);
      }
    });
    this.proc.stderr?.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && (msg.includes('ERROR') || msg.includes('Traceback') || msg.includes('Exception'))) {
        this.logger.error(`[fastapi] ${msg}`);
      }
    });

    this.proc.on('exit', (code) => {
      if (this.stopping) return;
      this.logger.warn(`FastAPI exited with code ${code}. Restarting in 3s...`);
      setTimeout(() => this.start(), 3000);
    });

    await this.waitUntilReady();
    this.logger.log(`FastAPI DroidRun service ready on port ${this.port}`);
  }

  private stop() {
    this.stopping = true;
    if (this.proc && !this.proc.killed) {
      this.proc.removeAllListeners('exit');
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }

  private waitUntilReady(retries = 30, delayMs = 500): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (remaining: number) => {
        get(`http://${this.host}:${this.port}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else retry(remaining);
        }).on('error', () => retry(remaining));
      };

      const retry = (remaining: number) => {
        if (remaining <= 0) return reject(new Error('FastAPI did not start in time'));
        setTimeout(() => attempt(remaining - 1), delayMs);
      };

      attempt(retries);
    });
  }
}
