import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** GET /api/v1/auth/status — Check if registration is needed */
  @Public()
  @Get('status')
  status() {
    return {
      hasAccount: this.authService.hasAnyUser(),
      registrationOpen: !this.authService.hasAnyUser(),
    };
  }

  /** POST /api/v1/auth/register — First-time registration only */
  @Public()
  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

  /** POST /api/v1/auth/login — Login with email/password */
  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  // ── API Keys (requires JWT auth) ──────────────────────────────────────

  /** GET /api/v1/auth/keys — List API keys */
  @Get('keys')
  listKeys() {
    return this.authService.listApiKeys();
  }

  /** POST /api/v1/auth/keys — Create API key */
  @Post('keys')
  createKey(@Body() body: { name: string }) {
    const { key, apiKey } = this.authService.createApiKey(body.name);
    return {
      key, // raw key — shown ONCE, never stored
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
    };
  }

  /** DELETE /api/v1/auth/keys/:id — Delete API key */
  @Delete('keys/:id')
  deleteKey(@Param('id') id: string) {
    this.authService.deleteApiKey(id);
    return { ok: true };
  }
}
