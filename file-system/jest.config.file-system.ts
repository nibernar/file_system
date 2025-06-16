import type { Config } from 'jest';

const config: Config = {
  displayName: 'File System Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Configuration globale des timeouts
  testTimeout: 30000, // 30s par défaut
  
  // Chemins des tests - STRUCTURE RÉELLE
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // Exclusions
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/'
  ],
  
  // Coverage
  collectCoverageFrom: [
    'src/infrastructure/**/*.ts',
    'src/config/**/*.ts',
    'src/types/**/*.ts', 
    'src/constants/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.mock.ts',
    '!src/**/*.interface.ts',
    '!src/**/index.ts'
  ],
  
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    // Seuils spécialisés pour modules critiques
    'src/infrastructure/garage/garage-storage.service.ts': {
      branches: 95,
      functions: 100,
      lines: 95,
      statements: 95
    }
  },
  
  coverageReporters: [
    'text-summary',
    'html',
    'lcov',
    'json-summary'
  ],
  
  coverageDirectory: 'coverage/file-system',
  
  // Setup - Configuration des tests
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/test-setup.ts'
  ],
  
  // Setup variables d'environnement depuis .env.test
  setupFiles: [
    '<rootDir>/jest.env.setup.js'
  ],
  
  // Performance
  maxWorkers: 4,
  verbose: true,
  
  // Transform - Configuration TypeScript
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
  
  moduleFileExtensions: ['js', 'json', 'ts'],
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Nettoyage des mocks entre tests
  clearMocks: true,
  restoreMocks: true,
  
  // Collecte des erreurs
  errorOnDeprecated: true,
  
  // Configuration silencieuse pour output propre
  silent: false,
  
  // Configuration roots
  roots: ['<rootDir>/src'],
  
  // Ignore des warnings spécifiques
  testEnvironmentOptions: {
    // Configuration Node.js pour tests
  },
  
  // Configuration pour permettre les imports ES6
  extensionsToTreatAsEsm: [],
  
  // Configuration spécifique aux différents environnements
  globalSetup: undefined,
  globalTeardown: undefined,
};

export default config;