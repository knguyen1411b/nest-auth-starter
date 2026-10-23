import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Role, User } from 'generated/prisma/client'
import { Readable } from 'stream'

import { PrismaService } from '@/core/prisma/prisma.service'
import { PasswordService } from '@/core/security/password.service'
import { CloudinaryService } from '@/core/storage/cloudinary.service'

import { UserQueryDto } from './dto/user-query.dto'
import { CreateUserDto, UpdateUserDto } from './dto/user.dto'

const profileSelect = {
    id: true,
    username: true,
    email: true,
    fullName: true,
    avatarUrl: true,
    role: true,
    status: true,
    metadata: true,
    updatedAt: true,
    createdAt: true
} satisfies Prisma.UserSelect

type Actor = Pick<User, 'id' | 'role'>

@Injectable()
export class UserService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cloudinary: CloudinaryService,
        private readonly passwords: PasswordService
    ) {}

    async create(dto: CreateUserDto, actor: Actor): Promise<void> {
        this.assertCanManage(actor, dto.role)
        const { password, ...data } = dto
        const passwordHash = await this.passwords.hash(password)
        try {
            await this.prisma.user.create({ data: { ...data, passwordHash } })
        } catch (error) {
            this.handleWriteError(error)
        }
    }

    getMe(user: User) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            role: user.role,
            status: user.status,
            metadata: user.metadata
        }
    }

    async uploadAvatar(userId: string, stream: Readable): Promise<void> {
        const result = await this.cloudinary.uploadImage(userId, stream)
        await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: result.secure_url } })
    }

    async findAll(query: UserQueryDto) {
        const { page = 1, limit = 10, q, sort = 'createdAt', order = 'desc' } = query
        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(q
                ? {
                      OR: [
                          { username: { contains: q, mode: 'insensitive' } },
                          { email: { contains: q, mode: 'insensitive' } }
                      ]
                  }
                : {})
        }
        const [data, total] = await this.prisma.$transaction(
            [
                this.prisma.user.findMany({
                    where,
                    select: profileSelect,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy: { [sort]: order }
                }),
                this.prisma.user.count({ where })
            ],
            { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
        )
        return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
    }

    async findOne(id: string) {
        const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: profileSelect })
        if (!user) throw new NotFoundException('User not found')
        return user
    }

    async update(id: string, dto: UpdateUserDto, actor: Actor): Promise<void> {
        const target = await this.findOne(id)
        this.assertCanManage(actor, target.role)
        if (dto.role) this.assertCanManage(actor, dto.role)
        const { password, ...data } = dto
        const passwordHash = password ? await this.passwords.hash(password) : undefined
        const revoke = Boolean(
            passwordHash || dto.status === 'LOCKED' || dto.status === 'DISABLED' || dto.email || dto.role
        )
        try {
            await this.prisma.$transaction(async transaction => {
                await transaction.user.update({
                    where: { id },
                    data: {
                        ...data,
                        ...(passwordHash ? { passwordHash } : {}),
                        ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
                        ...(dto.email ? { emailVerifiedAt: null } : {})
                    }
                })
                if (revoke) {
                    await transaction.refreshToken.deleteMany({ where: { userId: id } })
                }
                if (dto.email || dto.status === 'LOCKED' || dto.status === 'DISABLED') {
                    await transaction.emailVerification.deleteMany({ where: { userId: id } })
                }
            })
        } catch (error) {
            this.handleWriteError(error)
        }
    }

    async remove(id: string, actor: Actor): Promise<void> {
        const target = await this.findOne(id)
        this.assertCanManage(actor, target.role)
        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), tokenVersion: { increment: 1 } } }),
            this.prisma.refreshToken.deleteMany({ where: { userId: id } })
        ])
    }

    private assertCanManage(actor: Actor, targetRole: Role): void {
        if (actor.role === Role.ADMIN || (actor.role === Role.EDITOR && targetRole === Role.USER)) return
        throw new ForbiddenException('You do not have permission to manage this user')
    }

    private handleWriteError(error: unknown): never {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Username or email already exists!')
        }
        throw error
    }
}
