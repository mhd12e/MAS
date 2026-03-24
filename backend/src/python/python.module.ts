import { Global, Module } from '@nestjs/common';
import { PythonService } from './python.service';

@Global()
@Module({
  providers: [PythonService],
  exports: [PythonService],
})
export class PythonModule {}
