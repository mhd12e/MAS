import { Global, Module } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { RecordingController } from './recording.controller';

@Global()
@Module({
  controllers: [RecordingController],
  providers: [RecordingService],
  exports: [RecordingService],
})
export class RecordingModule {}
