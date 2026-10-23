import { Module } from '@nestjs/common'

import { PrismaModule } from '@/core/prisma/prisma.module'

import { HealthController } from './health.controller'
import { HealthService } from './health.service'

@Module({
    imports: [PrismaModule],
    providers: [HealthService],
    controllers: [HealthController],
    exports: [HealthService]
})
export class HealthModule {}
