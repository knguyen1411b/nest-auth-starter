import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule as AppThrottlerModule } from '@nestjs/throttler'

import { ConfigModule } from '../config/config.module'
import { ConfigService } from '../config/config.service'
import { PrismaModule } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { PostgresThrottlerStorage } from './postgres-throttler.storage'
import { ThrottlerGuard } from './throttler.guard'

@Module({
    imports: [
        AppThrottlerModule.forRootAsync({
            imports: [ConfigModule, PrismaModule],
            inject: [ConfigService, PrismaService],
            useFactory: (config: ConfigService, prisma: PrismaService) => ({
                storage: new PostgresThrottlerStorage(prisma),
                throttlers: [
                    {
                        ttl: config.getSecurityConfig().rateLimit.ttl,
                        limit: config.getSecurityConfig().rateLimit.limit
                    }
                ]
            })
        })
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class ThrottlerModule {}
