import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'generated/prisma/client'

import { LoggerService } from '@/common/logger/logger.service'

import { ConfigService } from '../config/config.service'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor(
        readonly configService: ConfigService,
        private readonly logger: LoggerService
    ) {
        const adapter = new PrismaPg({
            connectionString: configService.getDatabaseConfig().url
        })
        super({ adapter })
    }

    async onModuleInit() {
        await this.$connect()
        this.logger.log('Prisma connected')
    }

    async onModuleDestroy() {
        await this.$disconnect()
        this.logger.log('Prisma disconnected')
    }
}
