import {
  Controller, Post, Get, Param, Body, Res, NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DroidrunService } from './droidrun.service';
import { EmulatorService } from '../emulator/emulator.service';

@Controller('phones')
export class DroidrunController {
  constructor(
    private readonly droidrunService: DroidrunService,
    private readonly emulatorService: EmulatorService,
  ) {}

  /** POST /api/v1/phones/:id/agent/run — Streaming (SSE) */
  @Post(':id/agent/run')
  run(
    @Param('id') id: string,
    @Body('prompt') prompt: string,
    @Body('taskId') taskId: string,
    @Res() res: Response,
  ) {
    const instance = this.emulatorService.findOne(id);
    if (!instance) throw new NotFoundException('Phone not found');
    this.droidrunService.streamPrompt(id, instance.adbPort, prompt, taskId || '', res);
  }

  /** POST /api/v1/phones/:id/agent/run-sync — Non-streaming (waits for completion) */
  @Post(':id/agent/run-sync')
  async runSync(
    @Param('id') id: string,
    @Body('prompt') prompt: string,
    @Body('taskId') taskId: string,
    @Res() res: Response,
  ) {
    const instance = this.emulatorService.findOne(id);
    if (!instance) throw new NotFoundException('Phone not found');

    // Use the same streaming mechanism but collect events internally
    const events: { type: string; message: string; timestamp: string }[] = [];

    const sseRes = {
      _headers: {} as Record<string, string>,
      _data: '',
      setHeader(k: string, v: string) { this._headers[k] = v; },
      flushHeaders() {},
      write(chunk: string) {
        this._data += chunk;
      },
      end() {},
      on(_: string, __: () => void) {},
      socket: { setNoDelay() {} },
    } as unknown as Response;

    this.droidrunService.streamPrompt(id, instance.adbPort, prompt, taskId || '', sseRes);

    // Poll the active run until it completes
    const maxWait = 600_000; // 10 minutes
    const start = Date.now();

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!this.droidrunService.isRunning(id) || Date.now() - start > maxWait) {
          clearInterval(check);
          resolve();
        }
      }, 500);
    });

    // Small delay to ensure events are flushed
    await new Promise((r) => setTimeout(r, 1000));

    // Parse buffered events from the active run
    const activeRun = this.droidrunService.getActiveRun(id);
    if (activeRun) {
      for (const raw of activeRun.events) {
        const lines = raw.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { events.push(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
    }

    const steps = events.filter((e) => e.type === 'step').map((e) => e.message);
    const done = events.find((e) => e.type === 'done');
    const error = events.find((e) => e.type === 'error');

    res.json({
      success: !!done,
      result: done?.message || error?.message || null,
      steps,
      stepCount: steps.length,
      error: error?.message || null,
    });
  }

  /** GET /api/v1/phones/:id/agent/stream — Reconnect to active/recent run */
  @Get(':id/agent/stream')
  stream(@Param('id') id: string, @Res() res: Response) {
    const run = this.droidrunService.getActiveRun(id);
    if (!run) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'info', message: 'No active task.' })}\n\n`);
      res.end();
      return;
    }
    this.droidrunService.reconnectClient(run, res);
  }

  /** GET /api/v1/phones/:id/agent/status */
  @Get(':id/agent/status')
  status(@Param('id') id: string) {
    return { running: this.droidrunService.isRunning(id) };
  }

  /** GET /api/v1/phones/agent/suggestions */
  @Get('agent/suggestions')
  suggestions() {
    return this.droidrunService.getSuggestions();
  }
}
