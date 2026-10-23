import { ApiProperty, PartialType } from '@nestjs/swagger'
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator'
import { Role as UserRole, UserStatus } from 'generated/prisma/enums'

export { UserRole, UserStatus }

export class CreateUserDto {
    @ApiProperty({ example: 'john_doe', description: 'The username of the user' })
    @IsString()
    @Length(4, 50)
    username!: string

    @ApiProperty({ example: 'SecurePassword123!', description: 'The password of the user' })
    @IsString()
    @Length(8, 128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: 'password must contain upper, lower and number'
    })
    password!: string

    @ApiProperty({ example: 'john@example.com', description: 'The email of the user' })
    @IsEmail()
    @Length(5, 255)
    email!: string

    @ApiProperty({ example: 'John Doe', description: 'The full name of the user' })
    @IsString()
    @Length(2, 50)
    fullName!: string

    @ApiProperty({ example: 'USER', description: 'The role of the user' })
    @IsEnum(UserRole, {
        message: 'role must be ADMIN, EDITOR or USER'
    })
    role!: UserRole
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
    @ApiProperty({ example: 'ACTIVE', description: 'The status of the user' })
    @IsOptional()
    @IsEnum(UserStatus, {
        message: 'status must be ACTIVE, DISABLED or LOCKED'
    })
    status?: UserStatus
}
