import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'

import { JwtTokenService } from './jwt-token.service'
import { PasswordService } from './password.service'
import { TokenService } from './token.service'

@Module({
    imports: [JwtModule],
    providers: [JwtTokenService, PasswordService, TokenService],
    exports: [JwtTokenService, PasswordService, TokenService]
})
export class AuthCoreModule {}
