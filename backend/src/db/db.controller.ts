import {
  Controller, Get, Post, Patch, Delete, Param, Body, NotFoundException,
} from '@nestjs/common';
import { DbService } from './db.service';
import type { DbTask, DbMessage, DbStepEntry } from './db.types';

@Controller('tasks')
export class DbController {
  constructor(private db: DbService) {}

  @Get()
  getAllTasks() {
    return this.db.getAllTasks();
  }

  @Get('phone/:phoneId')
  getTasksForPhone(@Param('phoneId') phoneId: string) {
    return this.db.getTasksForPhone(phoneId);
  }

  @Get(':id')
  getTask(@Param('id') id: string) {
    const task = this.db.getTask(id);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Post()
  createTask(@Body() body: { phoneId: string; title: string }) {
    const task: DbTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phoneId: body.phoneId,
      title: body.title,
      pinned: false,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    this.db.addTask(task);
    return task;
  }

  @Post(':id/messages')
  addMessage(@Param('id') id: string, @Body() body: DbMessage) {
    const task = this.db.getTask(id);
    if (!task) throw new NotFoundException('Task not found');
    this.db.addMessage(id, body);
    return { ok: true };
  }

  @Patch(':taskId/messages/:msgId')
  updateMessage(
    @Param('taskId') taskId: string,
    @Param('msgId') msgId: string,
    @Body() body: Partial<DbMessage>,
  ) {
    this.db.updateMessage(taskId, msgId, body);
    return { ok: true };
  }

  @Post(':taskId/messages/:msgId/steps')
  appendSteps(
    @Param('taskId') taskId: string,
    @Param('msgId') msgId: string,
    @Body() body: { steps: DbStepEntry[] },
  ) {
    this.db.appendSteps(taskId, msgId, body.steps);
    return { ok: true };
  }

  @Patch(':id')
  updateTask(@Param('id') id: string, @Body() body: { title?: string; pinned?: boolean }) {
    const task = this.db.getTask(id);
    if (!task) throw new NotFoundException('Task not found');
    this.db.updateTask(id, body);
    return { ok: true };
  }

  @Delete(':id')
  deleteTask(@Param('id') id: string) {
    this.db.removeTask(id);
    return { ok: true };
  }
}
