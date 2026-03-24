import { Module } from '@nestjs/common';
import { EmulatorController } from './emulator.controller';
import { EmulatorService } from './emulator.service';

@Module({
  controllers: [EmulatorController],
  providers: [EmulatorService],
  exports: [EmulatorService],
})
export class EmulatorModule {}
