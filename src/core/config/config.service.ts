import { Inject, Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'

import { Config } from './interfaces/config'

@Injectable()
export class ConfigService {
    constructor(@Inject(NestConfigService) private readonly configService: NestConfigService) {}

    get<T = unknown>(key: string): T {
        const value = this.configService.get<T>(key)
        if (value === undefined) {
            throw new Error(`Configuration key ${key} is undefined`)
        }
        return value
    }

    getAppConfig() {
        return this.get<Config['app']>('app')
    }

    getAuthConfig() {
        return this.get<Config['auth']>('auth')
    }

    getDatabaseConfig() {
        return this.get<Config['database']>('database')
    }
    getCorsConfig() {
        return this.get<Config['cors']>('cors')
    }

    getSwaggerConfig() {
        return this.get<Config['swagger']>('swagger')
    }

    getSecurityConfig() {
        return this.get<Config['security']>('security')
    }

    getMailConfig() {
        return this.get<Config['mail']>('mail')
    }

    getCloudinaryConfig() {
        return this.get<Config['cloudinary']>('cloudinary')
    }
}
