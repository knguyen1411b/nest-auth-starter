import { EmailVerification, PasswordReset, RefreshToken, UsedRefreshToken, User } from 'generated/prisma/client'

export const password = 'StrongPassword123!'
export const registration = {
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Example',
    password
}

export function user(overrides: Partial<User> = {}): User {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        username: registration.username,
        email: registration.email,
        fullName: registration.fullName,
        passwordHash: 'not-a-real-hash',
        tokenVersion: 0,
        emailVerifiedAt: null,
        avatarUrl: null,
        role: 'USER',
        status: 'ACTIVE',
        metadata: null,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides
    }
}

export function databaseMock() {
    const delegate = <T, CreateData>() => ({
        findUnique: jest.fn<Promise<Partial<T> | null>, [unknown]>(),
        findFirst: jest.fn<Promise<Partial<T> | null>, [unknown]>(),
        findMany: jest.fn<Promise<Partial<T>[]>, [unknown]>().mockResolvedValue([]),
        count: jest.fn<Promise<number>, [unknown?]>().mockResolvedValue(0),
        create: jest.fn<Promise<Partial<T>>, [{ data: CreateData }]>(),
        update: jest.fn<Partial<T> | Promise<Partial<T>>, [{ where: Partial<T>; data: Partial<T> }]>(),
        delete: jest.fn<void | Promise<void>, [unknown]>(),
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown?]>().mockResolvedValue({ count: 0 }),
        upsert: jest.fn<Promise<Partial<T>>, [unknown]>(),
        updateMany: jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 1 })
    })
    const database = {
        user: delegate<User, Partial<User> & Pick<User, 'passwordHash'>>(),
        refreshToken: delegate<RefreshToken, Pick<RefreshToken, 'tokenId' | 'tokenHash' | 'userId' | 'expiresAt'>>(),
        usedRefreshToken: delegate<UsedRefreshToken, Partial<UsedRefreshToken>>(),
        passwordReset: delegate<PasswordReset, Partial<PasswordReset>>(),
        emailVerification: delegate<EmailVerification, Partial<EmailVerification>>(),
        $connect: jest.fn<Promise<void>, []>(),
        $disconnect: jest.fn<Promise<void>, []>(),
        $queryRaw: jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>().mockResolvedValue([])
    }
    return {
        ...database,
        $transaction: jest.fn(
            (operation: readonly Promise<unknown>[] | ((transaction: typeof database) => Promise<unknown>)) =>
                typeof operation === 'function' ? operation(database) : Promise.all(operation)
        )
    }
}

export function loggerMock() {
    return {
        log: jest.fn<void, [string]>(),
        error: jest.fn<void, [string, unknown?]>(),
        warn: jest.fn<void, [string]>(),
        debug: jest.fn<void, [string]>()
    }
}
