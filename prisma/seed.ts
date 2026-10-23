import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

import { PrismaClient } from '../generated/prisma/client'
import { seedAdmin } from '../src/core/security/admin-seed'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

seedAdmin(prisma, process.env)
    .then(() => console.log('Admin seed completed.'))
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : 'Admin seed failed')
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
