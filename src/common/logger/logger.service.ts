import { ConsoleLogger, Injectable } from '@nestjs/common'
import pino, { Logger } from 'pino'

@Injectable()
export class LoggerService extends ConsoleLogger {
    private readonly pinoInstance: Logger

    constructor() {
        super()

        this.pinoInstance = pino({
            level: 'info',
            ...(process.env.NODE_ENV === 'production'
                ? {}
                : {
                      transport: {
                          targets: [
                              {
                                  target: 'pino-pretty',
                                  level: 'info',
                                  options: {
                                      colorize: true,
                                      translateTime: 'SYS:standard'
                                  }
                              }
                          ]
                      }
                  })
        })
    }

    log(message: string) {
        this.pinoInstance.info(message)
    }

    error(message: string, trace?: string) {
        this.pinoInstance.error({ message, trace })
    }

    warn(message: string) {
        this.pinoInstance.warn(message)
    }

    debug(message: string) {
        this.pinoInstance.debug(message)
    }
}
