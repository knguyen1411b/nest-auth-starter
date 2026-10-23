import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'

@Injectable()
export class TokenService {
    generateRefreshToken(): { tokenId: string; refreshToken: string } {
        const tokenId = randomUUID()
        const refreshToken = tokenId + '.' + randomBytes(64).toString('hex')
        return { tokenId, refreshToken }
    }

    extractTokenId(refreshToken: string): string {
        if (typeof refreshToken !== 'string' || !/^[0-9a-f-]{36}\.[0-9a-f]{128}$/.test(refreshToken)) {
            throw new UnauthorizedException('Invalid refresh token!')
        }
        return refreshToken.split('.')[0]
    }

    hash(refreshToken: string): string {
        return createHash('sha256').update(refreshToken).digest('hex')
    }

    matches(refreshToken: string, hash: string): boolean {
        const actual = Buffer.from(this.hash(refreshToken), 'hex')
        const expected = Buffer.from(hash, 'hex')
        return expected.length === actual.length && timingSafeEqual(actual, expected)
    }
}
