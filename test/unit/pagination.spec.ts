import { BadRequestException, ValidationPipe } from '@nestjs/common'

import { UserQueryDto } from '@/modules/user/dto/user-query.dto'

describe('Pagination request contract', () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    const metadata = { type: 'query' as const, metatype: UserQueryDto }

    it('applies defaults when no query is supplied', async () => {
        expect(await pipe.transform({}, metadata)).toMatchObject({
            page: 1,
            limit: 10,
            sort: 'createdAt',
            order: 'desc'
        })
    })

    it('converts valid query strings into numeric pagination values', async () => {
        expect(await pipe.transform({ page: '2', limit: '20' }, metadata)).toMatchObject({ page: 2, limit: 20 })
    })

    it.each([
        { page: '0' },
        { page: '1.5' },
        { limit: '-1' },
        { limit: '101' },
        { limit: 'not-a-number' },
        { sort: 'passwordHash' },
        { order: 'invalid' },
        { extra: 'field' }
    ])('rejects invalid query input (%j)', async query => {
        await expect(pipe.transform(query, metadata)).rejects.toBeInstanceOf(BadRequestException)
    })
})
