import { JwtService } from '@nestjs/jwt'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { v2 as cloudinary } from 'cloudinary'
import { Writable } from 'stream'

import { JwtTokenService } from '@/core/security/jwt-token.service'
import { PasswordService } from '@/core/security/password.service'
import { TokenService } from '@/core/security/token.service'

import { createApp } from '../helpers/app'
import { databaseMock, password, registration, user } from '../helpers/fixtures'
import { ApiEnvelope, UserProfile } from '../helpers/http-types'
import { TestMethod } from '../helpers/http-types'

describe('HTTP API with real services and mocked database', () => {
    let app: NestFastifyApplication
    let db: ReturnType<typeof databaseMock>
    let account: ReturnType<typeof user>
    let token: string

    beforeAll(async () => {
        db = databaseMock()
        account = user({ passwordHash: await new PasswordService().hash(password) })
    })
    beforeEach(async () => {
        jest.resetAllMocks()
        db.$transaction.mockImplementation(operation =>
            typeof operation === 'function' ? operation(db) : Promise.all(operation)
        )
        db.$queryRaw.mockResolvedValue([])
        db.refreshToken.findUnique.mockResolvedValue({
            userId: account.id,
            sessionId: 'test-session',
            expiresAt: new Date(Date.now() + 600000),
            absoluteExpiresAt: new Date(Date.now() + 600000)
        })
        db.user.findUnique.mockResolvedValue(account)
        db.user.create.mockImplementation(({ data }) => Promise.resolve({ ...account, ...data }))
        db.user.findFirst.mockResolvedValue(null)
        db.user.findMany.mockResolvedValue([])
        db.user.count.mockResolvedValue(0)
        db.refreshToken.findMany.mockResolvedValue([])
        db.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
        ;({ app } = await createApp(db))
        token = await app.get(JwtTokenService).generateAccessToken(account.id, 0, 'test-session')
    })
    afterEach(async () => {
        await app?.close()
    })

    const request = (method: TestMethod, url: string, payload?: Record<string, unknown>, bearer?: string) =>
        app.inject({
            method,
            url: `/api/v1/${url}`,
            payload,
            headers: bearer ? { authorization: `Bearer ${bearer}` } : {}
        })

    it('exposes a public health endpoint with the standard success envelope', async () => {
        const response = await request('GET', 'health')
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope>()).toMatchObject({
            success: true,
            statusCode: 200,
            data: { status: 'healthy' }
        })
        expect(response.json<ApiEnvelope>().timestamp).toEqual(expect.any(String) as unknown)
    })

    it('returns detailed health information without authentication', async () => {
        const response = await request('GET', 'health/detailed')
        expect(response.json<ApiEnvelope>().data).toMatchObject({
            environment: 'test',
            memory: { unit: 'MB' },
            cpu: { usage: expect.any(Object) as unknown }
        })
    })

    it('reports readiness only while PostgreSQL is available', async () => {
        expect((await request('GET', 'health/ready')).statusCode).toBe(200)
        db.$queryRaw.mockRejectedValue(new Error('private database failure'))
        const response = await request('GET', 'health/ready')
        expect(response.statusCode).toBe(503)
        expect(response.body).not.toContain('private database failure')
        expect((await request('GET', 'health')).statusCode).toBe(200)
    })

    it('registers a user without authentication', async () => {
        const response = await request('POST', 'auth/register', registration)
        expect(response.statusCode).toBe(201)
        expect(response.json<ApiEnvelope>().success).toBe(true)
    })

    it.each([
        {},
        { ...registration, email: 'invalid' },
        { ...registration, password: 'weak' },
        { ...registration, username: 'a' },
        { ...registration, fullName: '' }
    ])('rejects invalid registration data (%j)', async payload => {
        expect((await request('POST', 'auth/register', payload)).statusCode).toBe(400)
        expect(db.user.create).not.toHaveBeenCalled()
    })

    it('returns 409 for a duplicate account', async () => {
        db.user.findFirst.mockResolvedValue(account)
        expect((await request('POST', 'auth/register', registration)).statusCode).toBe(409)
    })

    it('logs in with valid credentials and returns both tokens', async () => {
        const response = await request('POST', 'auth/login', { username: 'alice', password })
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope>().data).toEqual({
            accessToken: expect.any(String) as unknown,
            refreshToken: expect.any(String) as unknown
        })
    })

    it.each([{ username: 'alice', password: 'wrong' }, {}, { username: 'alice' }])(
        'rejects invalid login credentials (%j)',
        async payload => {
            expect((await request('POST', 'auth/login', payload)).statusCode).toBe(401)
        }
    )

    it.each(['users/me', 'users', 'users/unknown'])('protects GET /%s from anonymous access', async url => {
        const response = await request('GET', url)
        expect(response.statusCode).toBe(401)
        expect(response.json<ApiEnvelope>()).toMatchObject({ success: false, statusCode: 401, path: `/api/v1/${url}` })
    })

    it.each(['invalid', ''])('rejects an invalid bearer token (%s)', async bearer => {
        expect((await request('GET', 'users/me', undefined, bearer)).statusCode).toBe(401)
    })

    it('rejects a valid JWT whose user no longer exists', async () => {
        db.user.findUnique.mockResolvedValue(null)
        expect((await request('GET', 'users/me', undefined, token)).statusCode).toBe(401)
    })

    it.each([
        { secret: process.env.JWT_SECRET, expiresIn: -1 },
        { secret: 'incorrect-signature', expiresIn: 60 }
    ])('rejects expired or incorrectly signed JWTs (%j)', async options => {
        const invalid = new JwtService().sign({ sub: account.id }, options)
        expect((await request('GET', 'users/me', undefined, invalid)).statusCode).toBe(401)
    })

    it('returns a safe current-user profile', async () => {
        const response = await request('GET', 'users/me', undefined, token)
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope>().data).toMatchObject({ id: account.id, username: 'alice' })
        expect(response.json<ApiEnvelope>().data).not.toHaveProperty('passwordHash')
    })

    it.each([
        ['GET', 'users', undefined],
        ['GET', 'users/target', undefined],
        ['POST', 'users', { ...registration, role: 'USER' }],
        ['PATCH', 'users/target', { fullName: 'Updated User' }],
        ['DELETE', 'users/target', undefined]
    ])('denies an ordinary user access to %s /%s', async (method, url, payload) => {
        expect((await request(method as TestMethod, url, payload, token)).statusCode).toBe(403)
    })

    it.each(['ADMIN', 'EDITOR'] as const)('allows %s to list users', async role => {
        db.user.findUnique.mockResolvedValue(user({ role }))
        const response = await request('GET', 'users', undefined, token)
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope>()).toMatchObject({ data: [], meta: { total: 0, page: 1, limit: 10 } })
    })

    it('returns 404 when an admin requests a missing user', async () => {
        db.user.findUnique.mockResolvedValue(user({ role: 'ADMIN' }))
        expect((await request('GET', 'users/missing', undefined, token)).statusCode).toBe(404)
    })

    it('allows an admin to create, update and soft-delete a user', async () => {
        db.user.findUnique.mockResolvedValue(user({ role: 'ADMIN' }))
        expect((await request('POST', 'users', { ...registration, role: 'USER' }, token)).statusCode).toBe(201)
        db.user.findFirst.mockResolvedValue({ id: 'target', username: 'target' })
        expect((await request('PATCH', 'users/target', { fullName: 'Updated User' }, token)).statusCode).toBe(200)
        expect((await request('DELETE', 'users/target', undefined, token)).statusCode).toBe(200)
    })

    it('rejects an unsupported role in user creation', async () => {
        db.user.findUnique.mockResolvedValue(user({ role: 'ADMIN' }))
        expect((await request('POST', 'users', { ...registration, role: 'SUPERADMIN' }, token)).statusCode).toBe(400)
    })

    it('rejects invalid pagination before querying the database', async () => {
        db.user.findUnique.mockResolvedValue(user({ role: 'ADMIN' }))
        expect((await request('GET', 'users?page=0&limit=-1', undefined, token)).statusCode).toBe(400)
        expect(db.user.findMany).not.toHaveBeenCalled()
    })

    it('rejects a password change with a wrong current password', async () => {
        expect(
            (
                await request(
                    'POST',
                    'auth/change-password',
                    { currentPassword: 'WrongPassword123!', newPassword: 'NewPassword456!' },
                    token
                )
            ).statusCode
        ).toBe(401)
    })

    it('changes a password with valid credentials', async () => {
        expect(
            (
                await request(
                    'POST',
                    'auth/change-password',
                    { currentPassword: password, newPassword: 'NewPassword456!' },
                    token
                )
            ).statusCode
        ).toBe(200)
    })

    it('rejects a weak replacement password', async () => {
        expect(
            (await request('POST', 'auth/change-password', { currentPassword: password, newPassword: 'weak' }, token))
                .statusCode
        ).toBe(400)
    })

    it('rejects an unknown refresh token', async () => {
        expect((await request('POST', 'auth/refresh', { refreshToken: 'unknown.secret' })).statusCode).toBe(401)
    })

    it.each(['logout', 'logout-all'])('protects /auth/%s from anonymous access', async route => {
        expect((await request('POST', `auth/${route}`, {})).statusCode).toBe(401)
    })

    it('accepts authenticated logout and logout-all', async () => {
        db.refreshToken.findUnique.mockImplementation(where =>
            Promise.resolve(
                (where as { where: { sessionId?: string } }).where.sessionId
                    ? {
                          userId: account.id,
                          sessionId: 'test-session',
                          expiresAt: new Date(Date.now() + 600000),
                          absoluteExpiresAt: new Date(Date.now() + 600000)
                      }
                    : null
            )
        )
        expect(
            (
                await request(
                    'POST',
                    'auth/logout',
                    { refreshToken: new TokenService().generateRefreshToken().refreshToken },
                    token
                )
            ).statusCode
        ).toBe(200)
        expect((await request('POST', 'auth/logout-all', {}, token)).statusCode).toBe(200)
    })

    it('rejects an avatar upload without a file', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/users/upload-avatar',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data; boundary=empty' },
            payload: '--empty--\r\n'
        })
        expect(response.statusCode).toBe(400)
    })

    it('accepts a multipart avatar and exposes its URL on the profile', async () => {
        const upload = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            ((options: unknown, callback: (error: Error | null, result?: { secure_url: string }) => void) =>
                new Writable({
                    write(_chunk, _encoding, done) {
                        done()
                    },
                    final(done) {
                        callback(null, { secure_url: 'https://example.com/alice.png' })
                        done()
                    }
                })) as unknown as typeof cloudinary.uploader.upload_stream
        )
        db.user.update.mockImplementation(({ data }) => {
            db.user.findUnique.mockResolvedValue({ ...account, ...data })
            return { ...account, ...data }
        })
        try {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/users/upload-avatar',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data; boundary=image' },
                payload:
                    '--image\r\nContent-Disposition: form-data; name="image"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\nfake-image-bytes\r\n--image--\r\n'
            })
            expect(response.statusCode).toBe(200)
            expect(
                (await request('GET', 'users/me', undefined, token)).json<ApiEnvelope<UserProfile>>().data.avatarUrl
            ).toBe('https://example.com/alice.png')
        } finally {
            upload.mockRestore()
        }
    })

    it('hides unexpected database error details behind a 500 envelope', async () => {
        db.user.create.mockRejectedValue(new Error('private database credentials'))
        const response = await request('POST', 'auth/register', registration)
        expect(response.statusCode).toBe(500)
        expect(response.json<ApiEnvelope>()).toMatchObject({ success: false, message: 'Internal server error' })
        expect(response.body).not.toContain('private database credentials')
    })

    it('rejects requests outside the configured API version', async () => {
        expect((await app.inject({ method: 'GET', url: '/api/v2/health' })).statusCode).toBe(404)
    })
})
