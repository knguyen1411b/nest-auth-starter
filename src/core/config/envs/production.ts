import defaultConfig from './default'

export default () => {
    const config = defaultConfig()
    return { ...config, swagger: { ...config.swagger, enabled: false } }
}
