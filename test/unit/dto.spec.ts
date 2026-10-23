import { ClassConstructor, plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import {
    ChangePasswordDto,
    ForgotPasswordDto,
    RegisterDto,
    ResetPasswordDto,
    VerifyEmailDto
} from '@/modules/auth/dto/auth.dto'
import { CreateUserDto, UpdateUserDto } from '@/modules/user/dto/user.dto'

import { registration } from '../helpers/fixtures'

describe('Request DTO validation contracts', () => {
    it.each([
        [RegisterDto, registration],
        [ChangePasswordDto, { currentPassword: 'CurrentPassword123!', newPassword: 'NewPassword456!' }],
        [ForgotPasswordDto, { email: 'alice@example.com' }],
        [VerifyEmailDto, { otp: '123456' }],
        [ResetPasswordDto, { token: 'a'.repeat(64), newPassword: 'NewPassword456!' }],
        [CreateUserDto, { ...registration, role: 'USER' }],
        [UpdateUserDto, {}],
        [UpdateUserDto, { status: 'LOCKED', role: 'EDITOR' }]
    ])('accepts a valid %p payload', async (dto, payload) => {
        expect(await validate(plainToInstance(dto as ClassConstructor<object>, payload))).toEqual([])
    })

    it.each([
        [RegisterDto, { ...registration, username: 'a' }, 'username'],
        [RegisterDto, { ...registration, password: 'alllowercase' }, 'password'],
        [RegisterDto, { ...registration, password: 'A'.repeat(129) }, 'password'],
        [RegisterDto, { ...registration, email: 'invalid' }, 'email'],
        [RegisterDto, { ...registration, fullName: 'A' }, 'fullName'],
        [ChangePasswordDto, { currentPassword: 'short', newPassword: 'weak' }, 'newPassword'],
        [ForgotPasswordDto, { email: 'invalid' }, 'email'],
        [VerifyEmailDto, { otp: 123456 }, 'otp'],
        [ResetPasswordDto, { token: 'a'.repeat(64), newPassword: 'weak' }, 'newPassword'],
        [CreateUserDto, { ...registration, role: 'SUPERADMIN' }, 'role'],
        [CreateUserDto, { ...registration, username: 'a'.repeat(51), role: 'USER' }, 'username'],
        [UpdateUserDto, { status: 'UNKNOWN' }, 'status']
    ])('rejects an invalid %p field (%s)', async (dto, payload, field) => {
        const errors = await validate(plainToInstance(dto as ClassConstructor<object>, payload))
        expect(errors.map(error => error.property)).toContain(field)
    })
})
