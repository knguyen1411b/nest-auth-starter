const base = {
    rootDir: '.',
    testEnvironment: 'node',
    // Jest executes CommonJS; the editor/typecheck config uses Node16 resolution.
    // CommonJS also transforms Prisma's generated dynamic imports for Jest's VM.
    // Fastify dependencies use require(ESM), supported by Node 22+ but transpiled for Jest 29.
    transformIgnorePatterns: ['node_modules/(?!\\.pnpm/|content-disposition/|cookie/)'],
    transform: {
        '(?:content-disposition|cookie)[/\\\\]dist[/\\\\]index\\.js$': [
            'ts-jest',
            { tsconfig: { module: 'CommonJS', allowJs: true, isolatedModules: true }, diagnostics: false }
        ],
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'Node',
                    isolatedModules: true,
                    types: ['node', 'jest'],
                    declaration: false,
                    incremental: false
                }
            }
        ]
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@/(.*)$': '<rootDir>/src/$1',
        '^generated/(.*)$': '<rootDir>/generated/$1'
    },
    setupFiles: ['<rootDir>/test/setup.ts'],
    clearMocks: true
}

module.exports = {
    testTimeout: 30000,
    projects: ['unit', 'api', 'integration', 'regression'].map(name => ({
        ...base,
        displayName: name,
        testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`]
    })),
    collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.d.ts', '!src/**/dto/*.ts', '!src/**/*.module.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'html', 'json-summary']
}
