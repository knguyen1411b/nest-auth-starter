import { NestFastifyApplication } from '@nestjs/platform-fastify'

import { PasswordService } from '@/core/security/password.service'
import { AuthService } from '@/modules/auth/auth.service'

import { createApp } from '../helpers/app'
import { password, registration } from '../helpers/fixtures'
import { ApiEnvelope, SessionTokens, TestMethod } from '../helpers/http-types'
import { createPostgresDatabase } from '../helpers/postgres'

describe('Session lifecycle and account recovery', () => {
    let database: Awaited<ReturnType<typeof createPostgresDatabase>>
    let harness: Awaited<ReturnType<typeof createApp>>
    let app: NestFastifyApplication
    let userId: string
    beforeAll(async () => {
        database = await createPostgresDatabase()
    })
    beforeEach(async () => {
        await database.reset()
        harness = await createApp(database.db)
        app = harness.app
        const user = await database.db.user.create({
            data: {
                username: registration.username,
                email: registration.email,
                fullName: registration.fullName,
                passwordHash: await new PasswordService().hash(password),
                emailVerifiedAt: new Date()
            }
        })
        userId = user.id
    })
    afterEach(async () => {
        await app?.close()
    })
    afterAll(async () => {
        await database?.close()
    })

    const request = (method: TestMethod, route: string, payload?: Record<string, unknown>, token?: string) =>
        app.inject({
            method,
            url: `/api/v1/${route}`,
            payload,
            headers: token ? { authorization: `Bearer ${token}` } : {}
        })
    async function login() {
        const response = await request('POST', 'auth/login', { username: 'alice', password })
        expect(response.statusCode).toBe(200)
        return response.json<ApiEnvelope<SessionTokens>>().data
    }
    async function resetToken() {
        expect((await request('POST', 'auth/forgot-password', { email: registration.email })).statusCode).toBe(200)
        return harness.mailer.sendMail.mock.calls.at(-1)![0].context!.token
    }

    it('revokes only the logged-out device access and refresh credentials', async () => {
        const first = await login()
        const second = await login()
        expect(
            (await request('POST', 'auth/logout', { refreshToken: first.refreshToken }, first.accessToken)).statusCode
        ).toBe(200)
        expect((await request('GET', 'users/me', undefined, first.accessToken)).statusCode).toBe(401)
        expect((await request('GET', 'users/me', undefined, second.accessToken)).statusCode).toBe(200)
    })

    it('revokes access tokens immediately on logout-all', async () => {
        const first = await login()
        const second = await login()
        expect((await request('POST', 'auth/logout-all', {}, first.accessToken)).statusCode).toBe(200)
        for (const session of [first, second])
            expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
    })

    it('preserves the device ID and absolute deadline across rotation', async () => {
        const first = await login()
        const old = await database.db.refreshToken.findUniqueOrThrow({
            where: { tokenId: first.refreshToken.split('.')[0] }
        })
        const response = await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })
        expect(response.statusCode).toBe(200)
        const rotated = response.json<ApiEnvelope<SessionTokens>>().data
        const current = await database.db.refreshToken.findUniqueOrThrow({
            where: { tokenId: rotated.refreshToken.split('.')[0] }
        })
        expect(current.sessionId).toBe(old.sessionId)
        expect(current.absoluteExpiresAt).toEqual(old.absoluteExpiresAt)
        expect(current.createdAt).toEqual(old.createdAt)
        expect((await request('GET', 'users/me', undefined, first.accessToken)).statusCode).toBe(200)
    })

    it('revokes the rotated session on proven replay without revoking another device', async () => {
        const first = await login()
        const other = await login()
        const rotated = (await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })).json<
            ApiEnvelope<SessionTokens>
        >().data
        expect((await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401)
        expect((await request('GET', 'users/me', undefined, rotated.accessToken)).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: rotated.refreshToken })).statusCode).toBe(401)
        expect((await request('GET', 'users/me', undefined, other.accessToken)).statusCode).toBe(200)
    })

    it('does not revoke a session for a forged token sharing a consumed token ID', async () => {
        const first = await login()
        const rotated = (await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })).json<
            ApiEnvelope<SessionTokens>
        >().data
        const forged = first.refreshToken.slice(0, -1) + (first.refreshToken.endsWith('0') ? '1' : '0')
        expect((await request('POST', 'auth/refresh', { refreshToken: forged })).statusCode).toBe(401)
        expect((await request('GET', 'users/me', undefined, rotated.accessToken)).statusCode).toBe(200)
    })

    it('rejects refresh and access after the absolute session deadline', async () => {
        const session = await login()
        await database.db.refreshToken.updateMany({ where: { userId }, data: { absoluteExpiresAt: new Date(0) } })
        expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
    })

    it('resets the password once and revokes existing access and refresh tokens', async () => {
        const session = await login()
        const token = await resetToken()
        const payload = { token, newPassword: 'ReplacementPassword456!' }
        expect((await request('POST', 'auth/reset-password', payload)).statusCode).toBe(200)
        expect((await request('POST', 'auth/reset-password', payload)).statusCode).toBe(401)
        expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(401)
        expect(
            (await request('POST', 'auth/login', { username: 'alice', password: payload.newPassword })).statusCode
        ).toBe(200)
        expect(await database.db.passwordReset.count()).toBe(0)
    })

    it('consumes a reset token only once under concurrency', async () => {
        const token = await resetToken()
        const responses = await Promise.all(
            [1, 2].map(() => request('POST', 'auth/reset-password', { token, newPassword: 'ReplacementPassword456!' }))
        )
        expect(responses.map(response => response.statusCode).sort()).toEqual([200, 401])
    })

    it('invalidates a pending reset when the password changes', async () => {
        const session = await login()
        const token = await resetToken()
        expect(
            (
                await request(
                    'POST',
                    'auth/change-password',
                    { currentPassword: password, newPassword: 'ReplacementPassword456!' },
                    session.accessToken
                )
            ).statusCode
        ).toBe(200)
        expect(
            (await request('POST', 'auth/reset-password', { token, newPassword: 'AnotherPassword789!' })).statusCode
        ).toBe(401)
    })

    it('rejects login using identity validated before a password-version change', async () => {
        await database.db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } })
        await expect(app.get(AuthService).login(userId, 0)).rejects.toThrow('Session revoked')
        expect(await database.db.refreshToken.count({ where: { userId } })).toBe(0)
    })

    it('rejects stale refresh sessions even if a concurrent password change missed their insertion', async () => {
        const session = await login()
        await database.db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } })
        expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
    })

    it('rejects expired reset tokens', async () => {
        const token = await resetToken()
        await database.db.passwordReset.updateMany({ data: { expiresAt: new Date(0) } })
        expect(
            (await request('POST', 'auth/reset-password', { token, newPassword: 'ReplacementPassword456!' })).statusCode
        ).toBe(401)
    })

    it('returns success without sending mail for unknown or locked accounts', async () => {
        expect((await request('POST', 'auth/forgot-password', { email: 'missing@example.com' })).statusCode).toBe(200)
        await database.db.user.update({ where: { id: userId }, data: { status: 'LOCKED' } })
        expect((await request('POST', 'auth/forgot-password', { email: registration.email })).statusCode).toBe(200)
        expect(harness.mailer.sendMail).not.toHaveBeenCalled()
    })

    it('does not reactivate old access tokens after locking then unlocking a user', async () => {
        const session = await login()
        const admin = await database.db.user.create({
            data: {
                username: 'admin',
                email: 'admin@example.com',
                role: 'ADMIN',
                passwordHash: await new PasswordService().hash(password)
            }
        })
        const adminToken = (await app.get(AuthService).login(admin.id)).accessToken
        expect((await request('PATCH', `users/${userId}`, { status: 'LOCKED' }, adminToken)).statusCode).toBe(200)
        expect((await request('PATCH', `users/${userId}`, { status: 'ACTIVE' }, adminToken)).statusCode).toBe(200)
        expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
    })
})
