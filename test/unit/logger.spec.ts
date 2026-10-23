import pino from 'pino'

import { LoggerService } from '@/common/logger/logger.service'

jest.mock('pino', () => ({
    __esModule: true,
    default: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }))
}))

describe('Logger adapter', () => {
    it('preserves severity and error traces at the logging boundary', () => {
        const logger = new LoggerService()
        const result = (
            pino as unknown as jest.Mock<{ info: jest.Mock; warn: jest.Mock; debug: jest.Mock; error: jest.Mock }, []>
        ).mock.results[0]
        if (result.type !== 'return') throw new Error('Expected the logger factory to return its sink')
        const sink = result.value
        logger.log('started')
        logger.warn('slow query')
        logger.debug('debug detail')
        logger.error('failed', 'stack trace')
        expect(sink.info).toHaveBeenCalledWith('started')
        expect(sink.warn).toHaveBeenCalledWith('slow query')
        expect(sink.debug).toHaveBeenCalledWith('debug detail')
        expect(sink.error).toHaveBeenCalledWith({ message: 'failed', trace: 'stack trace' })
    })
})
