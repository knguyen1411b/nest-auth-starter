import { Module } from '@nestjs/common'

import { ConfigModule } from './config/config.module'
import { ThrottlerModule } from './throttler/throttler.module'

@Module({
    imports: [ConfigModule, ThrottlerModule]
})
export class CoreModule {}
