import compress from '@fastify/compress'
import fastifyCors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { VersioningType } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as yaml from 'js-yaml'

import { ConfigService } from './core/config/config.service'

export async function configureApp(app: NestFastifyApplication): Promise<void> {
    const config = app.get(ConfigService)
    const swagger = config.getSwaggerConfig()
    app.setGlobalPrefix(config.getAppConfig().apiPrefix, { exclude: [swagger.path, 'openapi.json', 'openapi.yaml'] })
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
    app.enableShutdownHooks()

    if (config.getSecurityConfig().helmet) await app.register(helmet)
    await app.register(compress)
    if (config.getCorsConfig().enabled) await app.register(fastifyCors, config.getCorsConfig())
    await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

    if (swagger.enabled) {
        const options = new DocumentBuilder()
            .setOpenAPIVersion(swagger.openApiVersion)
            .setTitle(swagger.title)
            .setDescription(swagger.description)
            .addBearerAuth()
            .setVersion(swagger.version)
            .build()
        const document = SwaggerModule.createDocument(app, options)
        SwaggerModule.setup(swagger.path, app, document)
        app.getHttpAdapter()
            .getInstance()
            .get('/openapi.yaml', (_, reply) => {
                reply.header('Content-Type', 'text/yaml').send(yaml.dump(document))
            })
    }
}
