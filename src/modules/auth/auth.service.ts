import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Prisma, Role, User, UserStatus } from 'generated/prisma/client'

import { PrismaService } from '@/core/prisma/prisma.service'
import { JwtTokenService } from '@/core/security/jwt-token.service'
import { PasswordService } from '@/core/security/password.service'

import { ChangePasswordDto, RegisterDto } from './dto/auth.dto'
import { SessionService } from './session.service'
import { VerificationService } from './verification.service'

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly passwords: PasswordService,
        private readonly jwt: JwtTokenService,
        private readonly sessions: SessionService,
        private readonly verification: VerificationService
    ) {}

    async register(dto: RegisterDto): Promise<void> {
        const existing = await this.prisma.user.findFirst({
            where: { OR: [{ username: dto.username }, { email: dto.email }] }
        })
        if (existing) throw new ConflictException('Username or email already exists!')
        const passwordHash = await this.passwords.hash(dto.password)
        try {
            const user = await this.prisma.user.create({
                data: {
                    username: dto.username,
                    email: dto.email,
                    fullName: dto.fullName,
                    passwordHash,
                    role: Role.USER,
                    status: UserStatus.DISABLED
                }
            })
            await this.verification.issue(user)
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('Username or email already exists!')
            }
            throw error
        }
    }

    async validateLocalUser(username: string, password: string): Promise<User> {
        if (
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            username.length > 50 ||
            Buffer.byteLength(password, 'utf8') > 72
        ) {
            throw new UnauthorizedException('Invalid Credentials!')
        }
        const user = await this.prisma.user.findUnique({ where: { username } })
        this.assertActive(user)
        if (!(await this.passwords.compare(password, user.passwordHash))) {
            throw new UnauthorizedException('Invalid Credentials!')
        }
        return user
    }

    async validateJwtUser(userId: string, tokenVersion?: number, sessionId?: string): Promise<User> {
        if (typeof userId !== 'string' || !userId) throw new UnauthorizedException('Invalid token!')
        const user = await this.prisma.user.findUnique({ where: { id: userId } })
        this.assertActive(user)
        if (tokenVersion !== undefined && tokenVersion !== user.tokenVersion) {
            throw new UnauthorizedException('Session revoked!')
        }
        if (sessionId) await this.sessions.assertActive(userId, sessionId)
        return user
    }

    async login(userId: string, expectedTokenVersion?: number) {
        const user = await this.validateJwtUser(userId, expectedTokenVersion)
        const refreshToken = await this.sessions.create(userId, user.tokenVersion)
        const accessToken = await this.jwt.generateAccessToken(
            userId,
            user.tokenVersion,
            this.sessionsTokenId(refreshToken)
        )
        return { accessToken, refreshToken }
    }

    async refresh(refreshToken: string) {
        const session = await this.sessions.validate(refreshToken)
        const user = await this.validateJwtUser(session.userId, session.tokenVersion)
        const rotated = await this.sessions.rotate(session)
        const accessToken = await this.jwt.generateAccessToken(session.userId, user.tokenVersion, session.sessionId)
        return { accessToken, refreshToken: rotated }
    }

    private sessionsTokenId(token: string) {
        return token.split('.')[0]
    }

    logout(refreshToken: string, userId?: string) {
        return this.sessions.revoke(refreshToken, userId)
    }

    logoutAll(userId: string) {
        return this.sessions.revokeAll(userId)
    }

    async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
        const user = await this.validateJwtUser(userId)
        if (!(await this.passwords.compare(dto.currentPassword, user.passwordHash))) {
            throw new UnauthorizedException('Current password is incorrect!')
        }
        const passwordHash = await this.passwords.hash(dto.newPassword)
        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
            this.prisma.refreshToken.deleteMany({ where: { userId } })
        ])
    }

    verifyEmail(token: string) {
        return this.verification.verify(token)
    }

    resendVerification(email: string) {
        return this.verification.resend(email)
    }

    private assertActive(user: User | null): asserts user is User {
        if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException('Invalid Credentials!')
        }
    }
}
