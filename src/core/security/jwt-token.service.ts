import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { ConfigService } from '../config/config.service'

@Injectable()
export class JwtTokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) {}

    async generateAccessToken(userId: string, tokenVersion = 0, sessionId?: string) {
        const jwtConfig = this.configService.getAuthConfig().jwt

        return this.jwtService.signAsync(
            { sub: userId, ver: tokenVersion, sid: sessionId },
            {
                secret: jwtConfig.secret,
                expiresIn: jwtConfig.expiresIn
            }
        )
    }

    verifyAccessToken(token: string) {
        return this.jwtService.verifyAsync<{ sub: string; ver?: number }>(token, {
            secret: this.configService.getAuthConfig().jwt.secret,
            algorithms: ['HS256']
        })
    }
}
