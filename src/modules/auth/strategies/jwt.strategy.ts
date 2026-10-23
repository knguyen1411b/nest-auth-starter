import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { ConfigService } from '@/core/config/config.service'

import { AuthService } from '../auth.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        config: ConfigService,
        private readonly authService: AuthService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: config.getAuthConfig().jwt.secret,
            ignoreExpiration: false,
            algorithms: ['HS256']
        })
    }

    validate(payload: { sub: string; ver?: number; sid?: string }) {
        if (typeof payload.sid !== 'string' || !payload.sid || !Number.isInteger(payload.ver)) {
            throw new UnauthorizedException('Invalid session claims')
        }
        return this.authService.validateJwtUser(payload.sub, payload.ver, payload.sid)
    }
}
