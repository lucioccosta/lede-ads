import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function isLedeRole(role: string) {
  return role === 'lede_admin' || role === 'lede_operator';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'lede-dev-secret-change-me'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: {
      sub: string;
      email: string;
      role: string;
      clientId: string | null;
    },
  ) {
    let clientId = payload.clientId;
    let actingAsClient = false;

    if (isLedeRole(payload.role)) {
      const raw = req.headers['x-client-context'];
      const actAs = Array.isArray(raw) ? raw[0] : raw;
      if (actAs && typeof actAs === 'string' && actAs.trim()) {
        clientId = actAs.trim();
        actingAsClient = true;
      }
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      clientId,
      actingAsClient,
    };
  }
}
