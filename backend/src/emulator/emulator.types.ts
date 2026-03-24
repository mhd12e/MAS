import type { ChildProcess } from 'child_process';
import type { WriteStream } from 'fs';

export interface ManagedProcess {
  proc: ChildProcess | null;
  restarts: number;
  maxRestarts: number;
  logStreams: WriteStream[];
}

export interface EmulatorInstance {
  id: string;
  name: string;
  index: number;
  displayNum: number;
  adbPort: number;
  vncPort: number;
  novncPort: number;
  status: 'booting' | 'ready' | 'error' | 'stopping';
  processes: {
    xvfb: ManagedProcess;
    emulator: ManagedProcess;
    x11vnc: ManagedProcess;
    websockify: ManagedProcess;
  };
}

export interface EmulatorInfo {
  id: string;
  name: string;
  novncPort: number;
  status: 'booting' | 'ready' | 'error' | 'stopping';
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    emulator: boolean;
    adb: boolean;
    novnc: boolean;
  };
}
