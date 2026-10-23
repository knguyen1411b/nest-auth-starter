import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, Length, Matches } from 'class-validator'

export class RegisterDto {
    @ApiProperty({ example: 'nguyen123', minLength: 4, maxLength: 50 })
    @IsString()
    @Length(4, 50)
    username!: string

    @ApiProperty({ example: 'Password123!' })
    @IsString()
    @Length(8, 128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: 'password is too weak'
    })
    password!: string

    @ApiProperty({ example: 'nguyen@example.com' })
    @IsEmail()
    @Length(5, 255)
    email!: string

    @ApiProperty({ example: 'Nguyen Van A' })
    @IsString()
    @Length(2, 50)
    fullName!: string
}

export class ChangePasswordDto {
    @ApiProperty({ example: 'CurrentPassword123!' })
    @IsString()
    @Length(8, 128)
    currentPassword!: string

    @ApiProperty({ example: 'NewPassword123!' })
    @IsString()
    @Length(8, 128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: 'new password is too weak'
    })
    newPassword!: string
}

export class VerifyEmailDto {
    @ApiProperty({ example: 'valid-reset-token' })
    @IsString()
    otp!: string
}

export class ResetPasswordDto {
    @ApiProperty({ description: '64-character token from the password reset email' })
    @IsString()
    @Matches(/^[a-f0-9]{64}$/)
    token!: string

    @ApiProperty({ example: 'newpassword123!' })
    @IsString()
    @Length(8, 128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: 'new password is too weak'
    })
    newPassword!: string
}

export class ForgotPasswordDto {
    @ApiProperty({ example: 'nguyen@example.com' })
    @IsEmail()
    @Length(5, 255)
    email!: string
}

export class EmailVerificationDto {
    @ApiProperty({ description: '64-character token from the verification email' })
    @IsString()
    @Matches(/^[a-f0-9]{64}$/)
    token!: string
}
