import type { Config } from 'jest';

const config: Config = {
  displayName: 'File System Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Chemins des tests - STRUCTURE RÉELLE
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // Coverage
  collectCoverageFrom: [
    'src/config/**/*.ts',
    'src/types/**/*.ts', 
    'src/constants/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.mock.ts'
  ],
  
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 80,
      statements: 80
    }
  },
  
  coverageReporters: [
    'text-summary',
    'html',
    'lcov'
  ],
  
  coverageDirectory: 'coverage/file-system',
  
  // Setup - CHEMIN CORRIGÉ
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/test-setup.ts'
  ],
  
  // Performance
  maxWorkers: 4,
  testTimeout: 30000,
  verbose: true,
  
  // Transform - NOUVELLE SYNTAXE ts-jest
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
  
  // Silencer certains warnings pour un output plus propre
  silent: false,
  
  // Collecte des erreurs
  errorOnDeprecated: true,
};

export default config;