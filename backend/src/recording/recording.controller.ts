import { Controller, Get, Delete, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync, createReadStream, statSync } from 'fs';
import { DbService } from '../db/db.service';
import { RecordingService } from './recording.service';

/** Recording with resolved names (looked up from phones/tasks, not stored) */
interface RecordingView {
  id: string;
  taskId: string;
  phoneId: string;
  phoneName: string;
  taskTitle: string;
  filename: string;
  durationSecs: number;
  status: string;
  createdAt: string;
}

@Controller('recordings')
export class RecordingController {
  constructor(
    private db: DbService,
    private recordingService: RecordingService,
  ) {}

  @Get()
  getAll(): RecordingView[] {
    return this.resolveAll(this.db.getRecordings().filter((r) => r.status === 'done'));
  }

  @Get('phone/:phoneId')
  getForPhone(@Param('phoneId') phoneId: string): RecordingView[] {
    return this.resolveAll(this.db.getRecordingsForPhone(phoneId).filter((r) => r.status === 'done'));
  }

  @Get(':id/video')
  streamVideo(@Param('id') id: string, @Res() res: Response) {
    const rec = this.db.getRecording(id);
    if (!rec) throw new NotFoundException('Recording not found');

    const filepath = join(this.recordingService.getRecordingsDir(), rec.filename);
    if (!existsSync(filepath)) throw new NotFoundException('Video file not found');

    const stat = statSync(filepath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    createReadStream(filepath).pipe(res);
  }

  @Delete(':id')
  deleteRecording(@Param('id') id: string) {
    const rec = this.db.getRecording(id);
    if (rec) {
      this.recordingService.deleteRecordingFile(rec.filename);
      this.db.removeRecording(id);
    }
    return { ok: true };
  }

  /** Resolve phoneName and taskTitle from their IDs */
  private resolveAll(recordings: { id: string; taskId: string; phoneId: string; filename: string; durationSecs: number; status: string; createdAt: string }[]): RecordingView[] {
    return recordings.map((rec) => {
      const phone = this.db.getPhone(rec.phoneId);
      const task = this.db.getTask(rec.taskId);
      return {
        ...rec,
        phoneName: phone?.name || rec.phoneId,
        taskTitle: task?.title || 'Deleted task',
      };
    });
  }
}
