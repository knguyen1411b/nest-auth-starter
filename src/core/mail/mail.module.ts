import { Module } from '@nestjs/common'

import { ConfigModule } from '../config/config.module'
import { MailTransport } from './mail-transport.service'
import { MailService } from './mail.service'

@Module({
    imports: [ConfigModule],
    providers: [MailTransport, MailService],
    exports: [MailService]
})
export class MailModule {}
