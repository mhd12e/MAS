import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { EmulatorModule } from './emulator/emulator.module';
import { DroidrunModule } from './droidrun/droidrun.module';
import { PythonModule } from './python/python.module';
import { RecordingModule } from './recording/recording.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    PythonModule,
    EmulatorModule,
    DroidrunModule,
    RecordingModule,
  ],
})
export class AppModule {}
