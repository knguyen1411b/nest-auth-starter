import { PrismaPg } from '@prisma/adapter-pg'
import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { PrismaClient } from 'generated/prisma/client'
import { join } from 'path'

// Only a dedicated database whose name ends in _test is accepted. Each suite owns
// a random schema; cleanup cannot delete application schemas or other test runs.
export async function createPostgresDatabase() {
    const connectionString = process.env.TEST_DATABASE_URL
    if (!connectionString)
        throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test. See test/README.md.')
    const url = new URL(connectionString)
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.pathname.endsWith('_test')) {
        throw new Error('Refusing integration tests: TEST_DATABASE_URL must name a dedicated database ending in _test.')
    }
    const schema = `nest_test_${randomUUID().replace(/-/g, '')}`
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) })
    try {
        await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        const migrationUrl = new URL(connectionString)
        migrationUrl.searchParams.set('schema', schema)
        execFileSync(
            process.execPath,
            [join(process.cwd(), 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
            {
                env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
                stdio: ['ignore', 'pipe', 'pipe']
            }
        )
        await db.$connect()
        return {
            db,
            async reset() {
                await db.passwordReset.deleteMany()
                await db.usedRefreshToken.deleteMany()
                await db.emailVerification.deleteMany()
                await db.rateLimit.deleteMany()
                await db.refreshToken.deleteMany()
                await db.user.deleteMany()
            },
            async close() {
                await db.$disconnect()
                try {
                    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
                } finally {
                    await admin.$disconnect()
                }
            }
        }
    } catch (error) {
        await db.$disconnect()
        try {
            await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        } finally {
            await admin.$disconnect()
        }
        throw error
    }
}
