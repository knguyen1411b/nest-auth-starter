import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary'
import { Readable, pipeline } from 'stream'

import { ConfigService } from '../config/config.service'

@Injectable()
export class CloudinaryService {
    constructor(private readonly configService: ConfigService) {
        const cloud = this.configService.getCloudinaryConfig()

        cloudinary.config({
            cloud_name: cloud.cloudName,
            api_key: cloud.apiKey,
            api_secret: cloud.apiSecret
        })
    }

    async uploadImage(userId: string, stream: Readable): Promise<UploadApiResponse> {
        const cloud = this.configService.getCloudinaryConfig()
        if (!cloud.cloudName || !cloud.apiKey || !cloud.apiSecret) {
            stream.resume()
            throw new ServiceUnavailableException('Avatar uploads are not configured')
        }
        return new Promise((resolve, reject) => {
            const upload = cloudinary.uploader.upload_stream(
                {
                    folder: this.configService.getCloudinaryConfig().folder,
                    public_id: `${this.configService.getCloudinaryConfig().publicIdPrefix}${userId}`,
                    resource_type: 'image',
                    overwrite: true
                },
                (error, result) => {
                    if (error) return reject(new Error(error.message))
                    if (!result) return reject(new Error('Image provider returned no result'))
                    resolve(result)
                }
            )
            pipeline(stream, upload, error => {
                if (error) reject(error)
            })
        })
    }
}
