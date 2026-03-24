import { Module } from '@nestjs/common';
import { DroidrunController } from './droidrun.controller';
import { DroidrunService } from './droidrun.service';
import { EmulatorModule } from '../emulator/emulator.module';
import { RecordingModule } from '../recording/recording.module';

@Module({
  imports: [EmulatorModule, RecordingModule],
  controllers: [DroidrunController],
  providers: [DroidrunService],
})
export class DroidrunModule {}
