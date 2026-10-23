import { createPostgresDatabase } from '../helpers/postgres'

describe('Integration database isolation', () => {
    const original = process.env.TEST_DATABASE_URL
    afterEach(() => {
        if (original === undefined) delete process.env.TEST_DATABASE_URL
        else process.env.TEST_DATABASE_URL = original
    })

    it('requires an explicit integration database instead of falling back to DATABASE_URL', async () => {
        delete process.env.TEST_DATABASE_URL
        await expect(createPostgresDatabase()).rejects.toThrow('Set TEST_DATABASE_URL')
    })

    it.each(['postgresql://localhost/production', 'https://localhost/app_test'])(
        'refuses an unsafe database URL (%s)',
        async url => {
            process.env.TEST_DATABASE_URL = url
            await expect(createPostgresDatabase()).rejects.toThrow('dedicated database ending in _test')
        }
    )
})
