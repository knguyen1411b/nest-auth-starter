import { NestFastifyApplication } from '@nestjs/platform-fastify'

import { JwtTokenService } from '@/core/security/jwt-token.service'
import { PasswordService } from '@/core/security/password.service'

import { createApp } from '../helpers/app'
import { databaseMock, password, user } from '../helpers/fixtures'
import { TestMethod } from '../helpers/http-types'
import { authServices } from '../helpers/services'

// These are desired contracts, not snapshots of today's vulnerabilities.
// Keep failing assertions visible until the corresponding production fix lands.
describe('Known security regressions', () => {
    let app: NestFastifyApplication
    let logs: Awaited<ReturnType<typeof createApp>>['logs']
    let db: ReturnType<typeof databaseMock>
    let account: ReturnType<typeof user>
    let accessToken: string
    beforeAll(async () => {
        db = databaseMock()
        ;({ app, logs } = await createApp(db))
        account = user({ passwordHash: await new PasswordService().hash(password) })
        accessToken = await app.get(JwtTokenService).generateAccessToken(account.id, 0, 'test-session')
    })
    beforeEach(() => {
        jest.resetAllMocks()
        db.$transaction.mockImplementation(operation =>
            typeof operation === 'function' ? operation(db) : Promise.all(operation)
        )
        db.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
        db.$queryRaw.mockResolvedValue([])
        db.refreshToken.findUnique.mockResolvedValue({
            userId: account.id,
            sessionId: 'test-session',
            expiresAt: new Date(Date.now() + 600000),
            absoluteExpiresAt: new Date(Date.now() + 600000)
        })
        db.user.findUnique.mockResolvedValue(account)
        db.user.findFirst.mockResolvedValue(account)
        db.refreshToken.findMany.mockResolvedValue([])
        db.user.findMany.mockResolvedValue([account])
        db.user.count.mockResolvedValue(1)
    })
    afterAll(async () => {
        await app?.close()
    })

    const request = (method: TestMethod, url: string, payload?: Record<string, unknown>, authenticated = false) =>
        app.inject({
            method,
            url: `/api/v1/${url}`,
            payload,
            headers: authenticated ? { authorization: `Bearer ${accessToken}` } : {}
        })

    it.each(['LOCKED', 'DISABLED'] as const)('rejects login for a %s account', async status => {
        db.user.findUnique.mockResolvedValue({ ...account, status })
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(401)
    })

    it('rejects login for a soft-deleted account', async () => {
        db.user.findUnique.mockResolvedValue({ ...account, deletedAt: new Date() })
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(401)
    })

    it.each(['LOCKED', 'DISABLED'] as const)('rejects existing JWTs for a %s account', async status => {
        db.user.findUnique.mockResolvedValue({ ...account, status })
        expect((await request('GET', 'users/me', undefined, true)).statusCode).toBe(401)
    })

    it('rejects an existing JWT after soft deletion', async () => {
        db.user.findUnique.mockResolvedValue({ ...account, deletedAt: new Date() })
        expect((await request('GET', 'users/me', undefined, true)).statusCode).toBe(401)
    })

    it('prevents an editor from promoting themselves to ADMIN', async () => {
        db.user.findUnique.mockResolvedValue({ ...account, role: 'EDITOR' })
        expect((await request('PATCH', `users/${account.id}`, { role: 'ADMIN' }, true)).statusCode).toBe(403)
    })

    it('does not log current or replacement passwords', async () => {
        await request(
            'POST',
            'auth/change-password',
            { currentPassword: password, newPassword: 'ChangedPassword456!' },
            true
        )
        expect(JSON.stringify(logs.log.mock.calls)).not.toContain(password)
        expect(JSON.stringify(logs.log.mock.calls)).not.toContain('ChangedPassword456!')
    })

    it('does not log refresh credentials', async () => {
        await request('POST', 'auth/refresh', { refreshToken: 'private-refresh-credential' })
        expect(JSON.stringify(logs.log.mock.calls)).not.toContain('private-refresh-credential')
    })

    it('does not log issued access tokens', async () => {
        await request('POST', 'auth/login', { username: 'alice', password })
        expect(JSON.stringify(logs.log.mock.calls)).not.toContain('eyJ')
    })

    it('rejects a missing refresh token as client input rather than a server error', async () => {
        expect([400, 401]).toContain((await request('POST', 'auth/refresh', {})).statusCode)
    })

    it('enforces the documented detailed-health rate limit', async () => {
        const statuses: number[] = []
        for (let index = 0; index < 6; index++) statuses.push((await request('GET', 'health/detailed')).statusCode)
        expect(statuses).toContain(429)
    })

    it('rejects a refresh credential whose suffix was altered after byte 72', async () => {
        const services = authServices(db)
        const token = services.tokens.generateRefreshToken()
        db.refreshToken.findUnique.mockResolvedValue({
            tokenId: token.tokenId,
            userId: account.id,
            tokenHash: services.tokens.hash(token.refreshToken),
            expiresAt: new Date(Date.now() + 60000)
        })
        const tail = token.refreshToken
            .slice(72)
            .split('')
            .map(value => (value === '0' ? '1' : '0'))
            .join('')
        const altered = token.refreshToken.slice(0, 72) + tail
        expect((await request('POST', 'auth/refresh', { refreshToken: altered })).statusCode).toBe(401)
    })

    it('rejects passwords exceeding bcrypt’s 72-byte limit before hashing', () => {
        const passwords = new PasswordService()
        expect(() => passwords.hash('A'.repeat(72) + 'original')).toThrow('72 UTF-8 bytes')
    })
})
