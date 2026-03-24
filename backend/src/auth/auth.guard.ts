import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value);
    } else {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    }
    return descriptor || target;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked @Public()
    const isPublic = this.reflector.get<boolean>(IS_PUBLIC_KEY, context.getHandler())
      || this.reflector.get<boolean>(IS_PUBLIC_KEY, context.getClass());

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // Try API key first (X-API-Key header)
    const apiKey = request.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string' && apiKey.startsWith('mas_')) {
      try {
        this.authService.verifyApiKey(apiKey);
        request.authType = 'apikey';
        return true;
      } catch {
        throw new UnauthorizedException('Invalid API key');
      }
    }

    // Try JWT (Authorization: Bearer <token>)
    const authHeader = request.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException('Authentication required');

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format. Use: Bearer <token>');
    }

    try {
      const payload = this.authService.verifyJwt(token);
      request.user = payload;
      request.authType = 'jwt';
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
