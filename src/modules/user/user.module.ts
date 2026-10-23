import { Module } from '@nestjs/common'

import { PrismaModule } from '@/core/prisma/prisma.module'
import { AuthCoreModule } from '@/core/security/auth-core.module'
import { CloudinaryModule } from '@/core/storage/cloudinary.module'

import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
    imports: [PrismaModule, AuthCoreModule, CloudinaryModule],
    controllers: [UserController],
    providers: [UserService]
})
export class UserModule {}
