import {
  Controller, Post, Get, Delete, Patch, Param, Body,
  HttpCode, HttpException, HttpStatus, NotFoundException,
} from '@nestjs/common';
import { EmulatorService } from './emulator.service';
import { RecordingService } from '../recording/recording.service';

@Controller('phones')
export class EmulatorController {
  constructor(
    private readonly emulatorService: EmulatorService,
    private readonly recordingService: RecordingService,
  ) {}

  @Post()
  @HttpCode(201)
  async create() {
    try {
      return await this.emulatorService.create();
    } catch (err: any) {
      throw new HttpException(
        err.message || 'Failed to create phone',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get()
  findAll() {
    return this.emulatorService.findAll().map((phone) => ({
      ...phone,
      agentRunning: this.recordingService.isRecording(phone.id),
    }));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const instance = this.emulatorService.findOne(id);
    if (!instance) throw new NotFoundException('Phone not found');
    const info = this.emulatorService.findAll().find((p) => p.id === id)!;
    return { ...info, agentRunning: this.recordingService.isRecording(id) };
  }

  @Get(':id/health')
  health(@Param('id') id: string) {
    return this.emulatorService.healthCheck(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string }) {
    const instance = this.emulatorService.findOne(id);
    if (!instance) throw new NotFoundException('Phone not found');
    if (body.name) this.emulatorService.rename(id, body.name);
    return { id, name: body.name };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emulatorService.remove(id);
  }
}
