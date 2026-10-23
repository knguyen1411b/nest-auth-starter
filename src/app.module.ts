import { Module, ValidationPipe } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'

import { HttpExceptionFilter } from './common/filters/global-exception.filter'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggerModule } from './common/logger/logger.module'
import { CoreModule } from './core/core.module'
import { AuthModule } from './modules/auth/auth.module'
import { HealthModule } from './modules/health/health.module'
import { UserModule } from './modules/user/user.module'

@Module({
    imports: [CoreModule, LoggerModule, HealthModule, AuthModule, UserModule],
    providers: [
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard
        },
        {
            provide: APP_GUARD,
            useClass: RolesGuard
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TransformInterceptor
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter
        },
        {
            provide: APP_PIPE,
            useFactory: () => new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
        }
    ]
})
export class AppModule {}
