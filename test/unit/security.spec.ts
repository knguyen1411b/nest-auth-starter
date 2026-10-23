import { JwtService } from '@nestjs/jwt'

import { ConfigService } from '@/core/config/config.service'
import { JwtTokenService } from '@/core/security/jwt-token.service'
import { PasswordService } from '@/core/security/password.service'
import { TokenService } from '@/core/security/token.service'

import { AccessClaims } from '../helpers/http-types'

describe('Security services', () => {
    const passwords = new PasswordService()
    const tokens = new TokenService()

    it('hashes passwords with a fresh salt and verifies only the correct password', async () => {
        const first = await passwords.hash('StrongPassword123!')
        const second = await passwords.hash('StrongPassword123!')
        expect(first).not.toBe(second)
        expect(first).not.toContain('StrongPassword123!')
        expect(await passwords.compare('StrongPassword123!', first)).toBe(true)
        expect(await passwords.compare('WrongPassword123!', first)).toBe(false)
    })

    it('creates independent opaque refresh tokens with extractable IDs', () => {
        const first = tokens.generateRefreshToken()
        const second = tokens.generateRefreshToken()
        expect(first.refreshToken).toMatch(/^[0-9a-f-]{36}\.[0-9a-f]{128}$/)
        expect(tokens.extractTokenId(first.refreshToken)).toBe(first.tokenId)
        expect(second.refreshToken).not.toBe(first.refreshToken)
        expect(second.tokenId).not.toBe(first.tokenId)
    })

    it('issues signed access tokens with the user identity and configured expiry', async () => {
        const jwt = new JwtService()
        const config = { getAuthConfig: () => ({ jwt: { secret: 'test-secret', expiresIn: 60 } }) }
        const service = new JwtTokenService(jwt, config as ConfigService)
        const token = await service.generateAccessToken('user-123')
        const claims = await jwt.verifyAsync<AccessClaims>(token, { secret: 'test-secret' })
        expect(claims.sub).toBe('user-123')
        expect(claims.exp - claims.iat).toBe(60)
        await expect(jwt.verifyAsync<AccessClaims>(token, { secret: 'wrong-secret' })).rejects.toThrow()
    })
})
