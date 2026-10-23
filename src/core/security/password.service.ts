import { BadRequestException, Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

@Injectable()
export class PasswordService {
    hash(password: string) {
        if (Buffer.byteLength(password, 'utf8') > 72) {
            throw new BadRequestException('Password must not exceed 72 UTF-8 bytes')
        }
        return bcrypt.hash(password, 10)
    }

    compare(password: string, hash: string) {
        if (Buffer.byteLength(password, 'utf8') > 72) return Promise.resolve(false)
        return bcrypt.compare(password, hash)
    }
}
