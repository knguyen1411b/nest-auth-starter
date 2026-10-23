import { isEmail } from 'class-validator'

import { PrismaClient, Role } from '../../../generated/prisma/client'
import { PasswordService } from './password.service'

export async function seedAdmin(prisma: PrismaClient, environment: Record<string, string | undefined>): Promise<void> {
    const username = environment.SEED_ADMIN_USERNAME || 'admin'
    const email = environment.SEED_ADMIN_EMAIL
    const password = environment.SEED_ADMIN_PASSWORD
    if (
        !email ||
        !isEmail(email) ||
        !password ||
        Buffer.byteLength(password, 'utf8') < 12 ||
        !/[a-z]/.test(password) ||
        !/[A-Z]/.test(password) ||
        !/\d/.test(password)
    ) {
        throw new Error(
            'Set SEED_ADMIN_EMAIL and a strong SEED_ADMIN_PASSWORD (12–72 UTF-8 bytes, upper/lower/number).'
        )
    }
    const passwords = new PasswordService()
    if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('SEED_ADMIN_PASSWORD must not exceed 72 UTF-8 bytes.')
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing && (existing.role !== Role.ADMIN || existing.deletedAt)) {
        throw new Error('Seed username belongs to a non-admin or deleted account; refusing to overwrite it.')
    }
    if (existing && existing.email === email && (await passwords.compare(password, existing.passwordHash))) return
    const passwordHash = await passwords.hash(password)
    if (!existing) {
        await prisma.user.create({ data: { username, email, passwordHash, fullName: 'Admin User', role: Role.ADMIN } })
    } else {
        await prisma.$transaction([
            prisma.user.update({
                where: { id: existing.id },
                data: { email, passwordHash, tokenVersion: { increment: 1 } }
            }),
            prisma.refreshToken.deleteMany({ where: { userId: existing.id } })
        ])
    }
}
