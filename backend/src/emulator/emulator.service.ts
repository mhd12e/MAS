import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, execFile, execFileSync, ChildProcess } from 'child_process';
import {
  readFileSync, readdirSync, writeFileSync, rmSync, existsSync,
  mkdirSync, createWriteStream, WriteStream,
} from 'fs';
import { join } from 'path';
import { createConnection } from 'net';
import {
  EmulatorInstance, EmulatorInfo, HealthCheckResult, ManagedProcess,
} from './emulator.types';
import { DbService } from '../db/db.service';
import { RecordingService } from '../recording/recording.service';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_EMULATORS = 6;
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_INTERVAL_MS = 3_000;
const LOGS_DIR = join(process.cwd(), '..', 'logs');

// Port allocation bases — documented here so the cleanup range matches
const DISPLAY_BASE = 11;      // displays :11 through :11+MAX
const ADB_PORT_BASE = 5556;   // adb ports 5556, 5558, 5560, ... (increments by 2)
const VNC_PORT_BASE = 5901;   // vnc ports 5901, 5902, ...
const NOVNC_PORT_BASE = 6081; // novnc ports 6081, 6082, ...
const DISPLAY_MAX = DISPLAY_BASE + MAX_EMULATORS;

@Injectable()
export class EmulatorService implements OnApplicationShutdown, OnModuleInit {
  private readonly logger = new Logger(EmulatorService.name);
  private readonly instances = new Map<string, EmulatorInstance>();
  private readonly usedSlots = new Set<number>(); // tracks which slot indices are in use
  private creationQueue: Promise<EmulatorInfo | null> = Promise.resolve(null);
  private kvmAvailable = false;
  private nextId = 1;

  private readonly sdkRoot: string;
  private readonly avdHome: string;
  private readonly baseAvdName: string;

  constructor(
    private config: ConfigService,
    private db: DbService,
    private recordingService: RecordingService,
  ) {
    this.sdkRoot = this.requireEnv('ANDROID_SDK_ROOT');
    this.avdHome = this.requireEnv('ANDROID_AVD_HOME');
    this.baseAvdName = config.get<string>('BASE_AVD_NAME') || 'Pixel_9_Pro_XL';
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  onModuleInit() {
    this.kvmAvailable = existsSync('/dev/kvm');
    this.logger.log(`SDK: ${this.sdkRoot}, AVD: ${this.avdHome}, Base: ${this.baseAvdName}`);
    this.logger.log(`KVM: ${this.kvmAvailable ? 'available' : 'NOT available'}`);

    // Verify base AVD exists at startup — fail fast
    const baseDir = join(this.avdHome, `${this.baseAvdName}.avd`);
    if (!existsSync(baseDir)) {
      this.logger.error(`Base AVD "${this.baseAvdName}" not found at ${this.avdHome}. Emulator creation will fail.`);
    } else {
      this.logger.log(`Base AVD "${this.baseAvdName}" verified`);
    }

    this.cleanupStaleResources();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  create(): Promise<EmulatorInfo> {
    // Serialize creation to prevent port allocation races
    const result = this.creationQueue
      .catch(() => {})
      .then(() => this.doCreate());
    this.creationQueue = result;
    return result;
  }

  findAll(): EmulatorInfo[] {
    return Array.from(this.instances.values()).map((i) => this.toInfo(i));
  }

  findOne(id: string): EmulatorInstance | undefined {
    return this.instances.get(id);
  }

  rename(id: string, name: string): void {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const instance = this.instances.get(id);
    if (instance) {
      instance.name = trimmed;
      this.db.updatePhone(id, { name: trimmed });
    }
  }

  async healthCheck(id: string): Promise<HealthCheckResult> {
    const instance = this.instances.get(id);
    const empty = { healthy: false, checks: { emulator: false, adb: false, novnc: false } };
    if (!instance) return empty;

    const emulatorAlive = instance.processes.emulator.proc?.killed === false;

    const adbOk = await this.adbCheckBoot(instance.adbPort);
    const novncOk = await this.checkPort(instance.novncPort);

    return { healthy: emulatorAlive && adbOk && novncOk, checks: { emulator: emulatorAlive, adb: adbOk, novnc: novncOk } };
  }

  async remove(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;
    instance.status = 'stopping';
    await this.cleanupInstance(instance);
    this.deleteAvd(id);
    this.cleanupDisplay(instance.displayNum);
    this.usedSlots.delete(instance.index);
    this.instances.delete(id);
    // Delete recording files before removing DB entries
    this.recordingService.deleteRecordingsForPhone(id);
    this.db.removePhone(id);
    this.logger.log(`Removed ${id}`);
  }

  async onApplicationShutdown() {
    this.logger.log('Shutting down — cleaning up all emulators');
    const ids = Array.from(this.instances.keys());
    for (const id of ids) {
      await this.remove(id);
    }
  }

  // ── Private: Creation ─────────────────────────────────────────────────────

  private async doCreate(): Promise<EmulatorInfo> {
    if (this.instances.size >= MAX_EMULATORS) {
      throw new Error(`Maximum of ${MAX_EMULATORS} phones reached. Remove one first.`);
    }

    // Find the next available slot (reuse freed slots)
    const slot = this.allocateSlot();
    const id = `phone-${this.nextId++}`;
    const name = `Phone ${slot}`;
    const displayNum = DISPLAY_BASE + slot;
    const adbPort = ADB_PORT_BASE + slot * 2;
    const vncPort = VNC_PORT_BASE + slot;
    const novncPort = NOVNC_PORT_BASE + slot;

    const logDir = join(LOGS_DIR, id);
    mkdirSync(logDir, { recursive: true });

    const mp = (): ManagedProcess => ({ proc: null, restarts: 0, maxRestarts: 3, logStreams: [] });
    const instance: EmulatorInstance = {
      id, name, index: slot, displayNum, adbPort, vncPort, novncPort,
      status: 'booting',
      processes: { xvfb: mp(), emulator: mp(), x11vnc: mp(), websockify: mp() },
    };

    this.instances.set(id, instance);
    this.db.addPhone({ id, name, createdAt: new Date().toISOString() });

    try {
      this.duplicateAvd(id);
      await this.startAll(instance);
      this.monitorBoot(instance);
    } catch (err) {
      this.logger.error(`Failed to create ${id}:`, err);
      instance.status = 'error';
      // Clean up partial creation
      await this.cleanupInstance(instance);
      this.deleteAvd(id);
      this.cleanupDisplay(displayNum);
    }

    return this.toInfo(instance);
  }

  private allocateSlot(): number {
    for (let i = 0; i < MAX_EMULATORS; i++) {
      if (!this.usedSlots.has(i)) {
        this.usedSlots.add(i);
        return i;
      }
    }
    throw new Error('No available slots');
  }

  // ── Private: AVD Management ───────────────────────────────────────────────

  private duplicateAvd(id: string) {
    const baseAvdDir = join(this.avdHome, `${this.baseAvdName}.avd`);
    const baseIni = join(this.avdHome, `${this.baseAvdName}.ini`);
    const newAvdDir = join(this.avdHome, `${id}.avd`);
    const newIni = join(this.avdHome, `${id}.ini`);

    if (!existsSync(baseAvdDir)) throw new Error(`Base AVD not found: ${baseAvdDir}`);

    execFileSync('cp', ['-r', baseAvdDir, newAvdDir]);

    let iniContent = readFileSync(baseIni, 'utf-8');
    iniContent = iniContent.replace(new RegExp(`${this.baseAvdName}\\.avd`, 'g'), `${id}.avd`);
    writeFileSync(newIni, iniContent);

    const configPath = join(newAvdDir, 'config.ini');
    if (existsSync(configPath)) {
      let c = readFileSync(configPath, 'utf-8');
      c = c.replace(/AvdId=.*/, `AvdId=${id}`).replace(/avd\.ini\.displayname=.*/, `avd.ini.displayname=${id}`);
      writeFileSync(configPath, c);
    }

    const hwPath = join(newAvdDir, 'hardware-qemu.ini');
    if (existsSync(hwPath)) {
      let h = readFileSync(hwPath, 'utf-8');
      h = h.replace(/avd\.name\s*=\s*.*/, `avd.name = ${id}`).replace(/avd\.id\s*=\s*.*/, `avd.id = ${id}`);
      writeFileSync(hwPath, h);
    }

    for (const lock of ['hardware-qemu.ini.lock', 'multiinstance.lock']) {
      const p = join(newAvdDir, lock);
      if (existsSync(p)) rmSync(p);
    }

    this.logger.log(`Duplicated AVD: ${this.baseAvdName} → ${id}`);
  }

  private deleteAvd(id: string) {
    try {
      const avdDir = join(this.avdHome, `${id}.avd`);
      const iniFile = join(this.avdHome, `${id}.ini`);
      if (existsSync(avdDir)) rmSync(avdDir, { recursive: true });
      if (existsSync(iniFile)) rmSync(iniFile);
    } catch (err) {
      this.logger.warn(`Failed to delete AVD ${id}:`, err);
    }
  }

  // ── Private: Process Management ───────────────────────────────────────────

  private async startAll(instance: EmulatorInstance) {
    const { id, displayNum } = instance;
    const logDir = join(LOGS_DIR, id);

    // 1. Xvfb — clean stale socket first
    this.cleanupDisplay(displayNum);

    this.spawnManaged(instance, 'xvfb', 'Xvfb', [
      `:${displayNum}`, '-screen', '0', '320x650x24', '-ac', '+extension', 'GLX', '+render', '-noreset',
    ], {}, logDir);
    await this.sleep(1500);
    await this.waitForDisplay(displayNum, 5000);

    // 2. Emulator
    const emulatorEnv: Record<string, string> = {
      ...process.env as any,
      DISPLAY: `:${displayNum}`,
      ANDROID_AVD_HOME: this.avdHome,
      ANDROID_SDK_ROOT: this.sdkRoot,
      XDG_SESSION_TYPE: 'x11',
    };
    delete emulatorEnv.WAYLAND_DISPLAY;

    const emulatorArgs = [
      '-avd', id, '-no-audio', '-no-boot-anim', '-no-metrics',
      '-port', String(instance.adbPort),
      '-gpu', 'swiftshader_indirect',
      ...(this.kvmAvailable ? [] : ['-no-accel']),
    ];

    this.spawnManaged(instance, 'emulator', this.emulatorBin(), emulatorArgs, emulatorEnv, logDir);
    await this.sleep(8000);

    // 3. Arrange windows (retries until window appears)
    await this.arrangeEmulatorWindow(displayNum, id, instance.adbPort);

    // 4. x11vnc — kill any leftover process on the VNC port first
    try { execFileSync('fuser', ['-k', `${instance.vncPort}/tcp`], { stdio: 'pipe', timeout: 3000 }); } catch {}
    await this.sleep(500);

    const vncEnv: Record<string, string> = { ...process.env as any, XDG_SESSION_TYPE: 'x11' };
    delete vncEnv.WAYLAND_DISPLAY;

    this.spawnManaged(instance, 'x11vnc', 'x11vnc', [
      '-display', `:${displayNum}`, '-rfbport', String(instance.vncPort),
      '-rfbportv6', '-1', // disable IPv6 to avoid dual-bind issues
      '-forever', '-nopw', '-shared', '-noxdamage',
    ], vncEnv, logDir);
    await this.sleep(2000);

    // 5. websockify + noVNC — kill any leftover process on the port first
    try { execFileSync('fuser', ['-k', `${instance.novncPort}/tcp`], { stdio: 'pipe', timeout: 3000 }); } catch {}
    await this.sleep(500);

    this.spawnManaged(instance, 'websockify', 'websockify', [
      '--web', '/usr/share/novnc', String(instance.novncPort), `localhost:${instance.vncPort}`,
    ], {}, logDir);

    this.logger.log(`${id}: all processes started`);
  }

  private spawnManaged(
    instance: EmulatorInstance,
    key: keyof EmulatorInstance['processes'],
    cmd: string,
    args: string[],
    envOverride: Record<string, string>,
    logDir: string,
  ) {
    const managed = instance.processes[key];

    // Close any previous log streams to prevent FD leaks
    for (const s of managed.logStreams) {
      try { s.end(); } catch {}
    }

    const stdoutStream = createWriteStream(join(logDir, `${key}.log`), { flags: 'a' });
    const stderrStream = createWriteStream(join(logDir, `${key}.err.log`), { flags: 'a' });
    managed.logStreams = [stdoutStream, stderrStream];

    const env = Object.keys(envOverride).length > 0 ? envOverride : undefined;
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env });
    proc.stdout?.pipe(stdoutStream);
    proc.stderr?.pipe(stderrStream);
    proc.unref();

    managed.proc = proc;

    proc.on('exit', (code) => {
      if (instance.status === 'stopping' || instance.status === 'error') return;

      this.logger.warn(`${instance.id}/${key}: exited with code ${code}`);

      if (managed.restarts < managed.maxRestarts) {
        managed.restarts++;
        this.logger.log(`${instance.id}/${key}: restarting (attempt ${managed.restarts}/${managed.maxRestarts})`);
        setTimeout(() => {
          if (instance.status !== 'stopping' && instance.status !== 'error') {
            this.spawnManaged(instance, key, cmd, args, envOverride, logDir);
          }
        }, 2000);
      } else {
        this.logger.error(`${instance.id}/${key}: max restarts reached`);
        instance.status = 'error';
      }
    });
  }

  private async cleanupInstance(instance: EmulatorInstance) {
    const order: (keyof EmulatorInstance['processes'])[] = ['websockify', 'x11vnc', 'emulator', 'xvfb'];

    // Try graceful adb emu kill
    try {
      execFileSync(this.adbBin(), ['-s', `emulator-${instance.adbPort}`, 'emu', 'kill'], {
        timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {}

    for (const key of order) {
      const managed = instance.processes[key];
      const pid = managed.proc?.pid;
      if (managed.proc && !managed.proc.killed && pid) {
        try { process.kill(-pid, 'SIGTERM'); } catch {}
        try { managed.proc.kill('SIGTERM'); } catch {}
      }
      // Close log streams
      for (const s of managed.logStreams) {
        try { s.end(); } catch {}
      }
      managed.logStreams = [];
      await this.sleep(500);
    }

    // Force kill anything still alive
    await this.sleep(1000);
    for (const key of order) {
      const managed = instance.processes[key];
      const pid = managed.proc?.pid;
      if (managed.proc && !managed.proc.killed && pid) {
        try { process.kill(-pid, 'SIGKILL'); } catch {}
        try { managed.proc.kill('SIGKILL'); } catch {}
      }
    }
  }

  // ── Private: Boot Monitoring (non-blocking) ───────────────────────────────

  private monitorBoot(instance: EmulatorInstance) {
    const startTime = Date.now();

    const interval = setInterval(async () => {
      if (instance.status !== 'booting') {
        clearInterval(interval);
        return;
      }

      if (Date.now() - startTime > BOOT_TIMEOUT_MS) {
        this.logger.warn(`${instance.id}: boot timeout — phone stays visible, remove manually if needed`);
        instance.status = 'error';
        clearInterval(interval);
        return;
      }

      const booted = await this.adbCheckBoot(instance.adbPort);
      if (booted) {
        instance.status = 'ready';
        this.logger.log(`${instance.id}: ready (${Math.round((Date.now() - startTime) / 1000)}s)`);
        clearInterval(interval);
      }
    }, BOOT_POLL_INTERVAL_MS);
  }

  /** Non-blocking ADB boot check using execFile (async) */
  private adbCheckBoot(adbPort: number): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(this.adbBin(), ['-s', `emulator-${adbPort}`, 'shell', 'getprop', 'sys.boot_completed'], {
        timeout: 5000,
      }, (err, stdout) => {
        resolve(!err && stdout.trim() === '1');
      });
    });
  }

  // ── Private: Window Management ────────────────────────────────────────────

  private async arrangeEmulatorWindow(displayNum: number, id: string, adbPort: number) {
    const env: Record<string, string> = {
      ...process.env as any,
      DISPLAY: `:${displayNum}`,
      XDG_SESSION_TYPE: 'x11',
    };
    delete env.WAYLAND_DISPLAY;
    delete env.XAUTHORITY;

    const opts = { timeout: 5000, stdio: 'pipe' as const, env };
    const title = `Android Emulator - ${id}:${adbPort}`;

    // Retry up to 5 times — emulator window may take time to appear
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const wids = execFileSync('xdotool', ['search', '--name', title], opts)
          .toString().trim().split('\n').filter(Boolean);

        if (wids.length > 0) {
          const wid = wids[0];
          execFileSync('xdotool', ['windowmove', wid, '0', '0'], opts);
          execFileSync('xdotool', ['windowsize', wid, '320', '650'], opts);
          execFileSync('xdotool', ['windowraise', wid], opts);
          this.logger.log(`${id}: positioned phone window (${wid})`);

          // Also minimize Extended Controls if it appeared
          try {
            const extWids = execFileSync('xdotool', ['search', '--name', 'Extended Controls'], opts)
              .toString().trim().split('\n').filter(Boolean);
            for (const wid of extWids) {
              execFileSync('xdotool', ['windowminimize', wid], opts);
            }
          } catch { /* Extended Controls may not appear — that's fine */ }
          return; // success
        }
      } catch { /* window not found yet */ }

      await this.sleep(3000);
    }
    this.logger.warn(`${id}: window arrangement skipped — emulator window not found after retries`);
  }

  // ── Private: Cleanup ──────────────────────────────────────────────────────

  private cleanupStaleResources() {
    // Get the set of phone IDs registered in db.json
    const registeredIds = new Set(this.db.getPhones().map((p) => p.id));

    // Scan AVD directory for phone-N entries
    try {
      const files = readdirSync(this.avdHome);
      for (const f of files) {
        const match = f.match(/^(phone-\d+)\.(avd|ini)$/);
        if (!match) continue;
        const phoneId = match[1];

        // Skip AVDs that are registered in the DB
        if (registeredIds.has(phoneId)) continue;

        // This AVD is orphaned — delete it
        rmSync(join(this.avdHome, f), { recursive: true, force: true });
        this.logger.log(`Cleaned up orphaned AVD: ${f}`);
      }
    } catch {}

    // Clean up DB entries for phones whose AVD files no longer exist
    for (const phone of this.db.getPhones()) {
      const avdDir = join(this.avdHome, `${phone.id}.avd`);
      if (!existsSync(avdDir)) {
        this.logger.log(`Removing DB entry for missing AVD: ${phone.id}`);
        this.db.removePhone(phone.id); // also removes associated tasks
      }
    }

    // Remove stale X11 sockets in our display range
    for (let d = DISPLAY_BASE; d <= DISPLAY_MAX; d++) {
      this.cleanupDisplay(d);
    }

    // Kill orphaned processes from previous runs
    for (const pattern of ['Xvfb :1[1-9]', 'x11vnc.*590[1-9]', 'websockify.*608[1-9]']) {
      try { execFileSync('pkill', ['-f', pattern], { stdio: 'pipe', timeout: 3000 }); } catch {}
    }
  }

  private cleanupDisplay(displayNum: number) {
    try { rmSync(`/tmp/.X${displayNum}-lock`); } catch {}
    try { rmSync(`/tmp/.X11-unix/X${displayNum}`); } catch {}
  }

  // ── Private: Utilities ────────────────────────────────────────────────────

  private emulatorBin(): string {
    return join(this.sdkRoot, 'emulator', 'emulator');
  }

  private adbBin(): string {
    return join(this.sdkRoot, 'platform-tools', 'adb');
  }

  private requireEnv(key: string): string {
    const val = this.config.get<string>(key) || process.env[key];
    if (!val) {
      throw new Error(`Required environment variable ${key} is not set. Add it to backend/.env`);
    }
    return val;
  }

  private async waitForDisplay(displayNum: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (existsSync(`/tmp/.X11-unix/X${displayNum}`)) return;
      await this.sleep(300);
    }
    this.logger.warn(`Display :${displayNum} did not become available in ${timeoutMs}ms`);
  }

  private checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ port, host: 'localhost' }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
    });
  }

  private toInfo(instance: EmulatorInstance): EmulatorInfo {
    return {
      id: instance.id,
      name: instance.name,
      novncPort: instance.novncPort,
      status: instance.status,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
