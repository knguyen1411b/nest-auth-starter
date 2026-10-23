import { NestFastifyApplication } from '@nestjs/platform-fastify'

import { PasswordService } from '@/core/security/password.service'
import { AuthService } from '@/modules/auth/auth.service'

import { createApp } from '../helpers/app'
import { password, registration } from '../helpers/fixtures'
import { ApiEnvelope, SessionTokens, UserProfile } from '../helpers/http-types'
import { TestMethod } from '../helpers/http-types'
import { createPostgresDatabase } from '../helpers/postgres'

describe('HTTP API with real PostgreSQL', () => {
    let database: Awaited<ReturnType<typeof createPostgresDatabase>>
    let app: NestFastifyApplication
    let adminToken: string

    beforeAll(async () => {
        database = await createPostgresDatabase()
    })
    beforeEach(async () => {
        await database.reset()
        ;({ app } = await createApp(database.db))
        const admin = await database.db.user.create({
            data: {
                username: 'administrator',
                email: 'admin@example.com',
                role: 'ADMIN',
                passwordHash: await new PasswordService().hash(password)
            }
        })
        adminToken = (await app.get(AuthService).login(admin.id)).accessToken
    })
    afterEach(async () => {
        await app?.close()
    })
    afterAll(async () => {
        await database?.close()
    })

    const request = (method: TestMethod, url: string, payload?: Record<string, unknown>, token?: string) =>
        app.inject({
            method,
            url: `/api/v1/${url}`,
            payload,
            headers: token ? { authorization: `Bearer ${token}` } : {}
        })

    async function createAccount() {
        expect((await request('POST', 'users', { ...registration, role: 'USER' }, adminToken)).statusCode).toBe(201)
        const response = await request('POST', 'auth/login', { username: 'alice', password })
        expect(response.statusCode).toBe(200)
        return response.json<ApiEnvelope<SessionTokens>>().data
    }

    it('persists an account and exposes its authenticated profile through the API', async () => {
        const session = await createAccount()
        const profile = await request('GET', 'users/me', undefined, session.accessToken)
        expect(profile.statusCode).toBe(200)
        expect(profile.json<ApiEnvelope<UserProfile>>().data).toMatchObject({
            username: 'alice',
            email: 'alice@example.com',
            role: 'USER'
        })
        expect(profile.json<ApiEnvelope<UserProfile>>().data).not.toHaveProperty('passwordHash')
    })

    it('rejects duplicate registration against the real unique constraints', async () => {
        expect((await request('POST', 'auth/register', registration)).statusCode).toBe(201)
        expect((await request('POST', 'auth/register', registration)).statusCode).toBe(409)
        expect((await request('POST', 'auth/register', { ...registration, username: 'another' })).statusCode).toBe(409)
        expect(
            (await request('POST', 'auth/register', { ...registration, email: 'another@example.com' })).statusCode
        ).toBe(409)
    })

    it('changes a stored password and rejects the old login', async () => {
        const session = await createAccount()
        expect(
            (
                await request(
                    'POST',
                    'auth/change-password',
                    { currentPassword: password, newPassword: 'ChangedPassword456!' },
                    session.accessToken
                )
            ).statusCode
        ).toBe(200)
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(401)
        expect(
            (await request('POST', 'auth/login', { username: 'alice', password: 'ChangedPassword456!' })).statusCode
        ).toBe(200)
    })

    it('rotates a stored refresh token and prevents reuse of the old token', async () => {
        const session = await createAccount()
        const response = await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope<SessionTokens>>().data.refreshToken).not.toBe(session.refreshToken)
        expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
        expect(
            (await request('GET', 'users/me', undefined, response.json<ApiEnvelope<SessionTokens>>().data.accessToken))
                .statusCode
        ).toBe(401)
    })

    it('revokes only the current device on logout', async () => {
        const first = await createAccount()
        const second = (await request('POST', 'auth/login', { username: 'alice', password })).json<
            ApiEnvelope<SessionTokens>
        >().data
        expect(
            (await request('POST', 'auth/logout', { refreshToken: first.refreshToken }, first.accessToken)).statusCode
        ).toBe(200)
        expect((await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(200)
    })

    it('revokes every device on logout-all', async () => {
        const first = await createAccount()
        const second = (await request('POST', 'auth/login', { username: 'alice', password })).json<
            ApiEnvelope<SessionTokens>
        >().data
        expect((await request('POST', 'auth/logout-all', {}, first.accessToken)).statusCode).toBe(200)
        for (const session of [first, second]) {
            expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
        }
    })

    it('evicts the oldest device after six sequential logins', async () => {
        const first = await createAccount()
        let last = first
        for (let index = 0; index < 5; index++) {
            last = (await request('POST', 'auth/login', { username: 'alice', password })).json<
                ApiEnvelope<SessionTokens>
            >().data
        }
        expect((await request('POST', 'auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: last.refreshToken })).statusCode).toBe(200)
    })

    it('persists profile updates and hides soft-deleted users from individual lookups', async () => {
        const session = await createAccount()
        const id = (await request('GET', 'users/me', undefined, session.accessToken)).json<ApiEnvelope<UserProfile>>()
            .data.id
        expect((await request('PATCH', `users/${id}`, { fullName: 'Updated Alice' }, adminToken)).statusCode).toBe(200)
        expect(
            (await request('GET', `users/${id}`, undefined, adminToken)).json<ApiEnvelope<UserProfile>>().data.fullName
        ).toBe('Updated Alice')
        expect((await request('DELETE', `users/${id}`, undefined, adminToken)).statusCode).toBe(200)
        expect((await request('GET', `users/${id}`, undefined, adminToken)).statusCode).toBe(404)
        expect((await request('DELETE', `users/${id}`, undefined, adminToken)).statusCode).toBe(404)
    })

    it('returns real default pagination counts', async () => {
        await createAccount()
        const response = await request('GET', 'users', undefined, adminToken)
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope<SessionTokens>>().meta).toEqual({ total: 2, page: 1, limit: 10, pages: 1 })
        expect(response.json<ApiEnvelope<SessionTokens>>().data).toHaveLength(2)
    })

    it('enforces database uniqueness and rolls back a failed transaction', async () => {
        const data = { username: 'transaction', email: 'transaction@example.com', passwordHash: 'test-hash' }
        await expect(
            database.db.$transaction([database.db.user.create({ data }), database.db.user.create({ data })])
        ).rejects.toMatchObject({ code: 'P2002' })
        expect(await database.db.user.findUnique({ where: { username: 'transaction' } })).toBeNull()
    })

    it('cascades refresh-session deletion when the owning user is physically deleted', async () => {
        const session = await createAccount()
        const id = (await request('GET', 'users/me', undefined, session.accessToken)).json<ApiEnvelope<UserProfile>>()
            .data.id
        await database.db.user.delete({ where: { id } })
        expect(await database.db.refreshToken.count({ where: { userId: id } })).toBe(0)
        expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
    })
})
