import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { DbService } from '../db/db.service';
import type { DbUser, DbApiKey } from '../db/db.types';

interface JwtPayload {
  sub: string;  // user ID
  email: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private db: DbService,
    private config: ConfigService,
  ) {
    // Generate a random secret if not configured — stored in memory only
    // For production, set JWT_SECRET in .env
    this.jwtSecret = config.get<string>('JWT_SECRET') || randomBytes(32).toString('hex');
  }

  // ── Registration ────────────────────────────────────────────────────────

  async register(email: string, password: string): Promise<{ token: string }> {
    // Only allow registration if no users exist
    if (this.db.hasAnyUser()) {
      throw new ForbiddenException('Registration is closed. An account already exists.');
    }

    if (!email || !password) throw new UnauthorizedException('Email and password required');
    if (password.length < 8) throw new UnauthorizedException('Password must be at least 8 characters');

    const existing = this.db.getUserByEmail(email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user: DbUser = {
      id: `user-${Date.now()}`,
      email: email.toLowerCase().trim(),
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.db.addUser(user);
    return { token: this.signJwt(user) };
  }

  // ── Login ───────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<{ token: string }> {
    if (!email || !password) throw new UnauthorizedException('Email and password required');

    const user = this.db.getUserByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return { token: this.signJwt(user) };
  }

  // ── JWT verification ───────────────────────────────────────────────────

  verifyJwt(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // ── API Key management ─────────────────────────────────────────────────

  createApiKey(name: string): { key: string; apiKey: DbApiKey } {
    // Generate a random key: mas_<32 random hex chars>
    const raw = `mas_${randomBytes(24).toString('hex')}`;
    const keyHash = this.hashApiKey(raw);
    const prefix = raw.slice(0, 12) + '...';

    const apiKey: DbApiKey = {
      id: `key-${Date.now()}-${randomBytes(3).toString('hex')}`,
      name: name || 'Untitled',
      keyHash,
      prefix,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    this.db.addApiKey(apiKey);

    // Return the raw key ONCE — it's never stored, only the hash
    return { key: raw, apiKey };
  }

  verifyApiKey(raw: string): DbApiKey {
    const hash = this.hashApiKey(raw);
    const key = this.db.findApiKeyByHash(hash);
    if (!key) throw new UnauthorizedException('Invalid API key');

    // Update last used
    this.db.updateApiKeyLastUsed(key.id);
    return key;
  }

  listApiKeys(): Omit<DbApiKey, 'keyHash'>[] {
    return this.db.getApiKeys().map(({ keyHash, ...rest }) => rest);
  }

  deleteApiKey(id: string): void {
    this.db.removeApiKey(id);
  }

  // ── Auth status ────────────────────────────────────────────────────────

  hasAnyUser(): boolean {
    return this.db.hasAnyUser();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private signJwt(user: DbUser): string {
    return jwt.sign(
      { sub: user.id, email: user.email } as JwtPayload,
      this.jwtSecret,
      { expiresIn: '7d' },
    );
  }

  private hashApiKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
