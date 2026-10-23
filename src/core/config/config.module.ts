import { Global, Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'

import { ConfigService } from './config.service'
import { envValidationSchema } from './env.validation'
import developmentConfig from './envs/development'
import productionConfig from './envs/production'

@Global()
@Module({
    imports: [
        NestConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            envFilePath: ['.env'],
            load: [() => (process.env.NODE_ENV === 'production' ? productionConfig() : developmentConfig())],
            validationSchema: envValidationSchema,
            validationOptions: {
                abortEarly: false
            }
        })
    ],
    providers: [ConfigService],
    exports: [ConfigService]
})
export class ConfigModule {}
