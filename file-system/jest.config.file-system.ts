import type { Config } from 'jest';

const config: Config = {
  displayName: 'File System Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Configuration globale des timeouts
  testTimeout: 30000, // 30s par défaut
  
  // CHEMINS AJUSTÉS POUR __test__ ET PATTERNS
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/__test__/**/*.spec.ts',
    '<rootDir>/src/**/__tests__/**/*.spec.ts'
  ],
  
  // Exclusions
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/'
  ],
  
  // COVERAGE AJUSTÉ POUR __test__
  collectCoverageFrom: [
    'src/infrastructure/**/*.ts',
    'src/application/**/*.ts',
    'src/domain/**/*.ts',
    'src/config/**/*.ts',
    'src/types/**/*.ts', 
    'src/constants/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/__test__/**',
    '!src/**/__tests__/**',
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
    'src/infrastructure/queue/file-processing.processor.ts': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    'src/application/use-cases/process-file-async.use-case.ts': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
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
  
  // ✅ CONFIGURATION CORRIGÉE POUR .js et .ts
  setupFiles: [
    '<rootDir>/jest.env.setup.js'
  ],
  
  // Performance
  maxWorkers: 4,
  verbose: true,
  
  // ✅ TRANSFORM CORRIGÉ - NOUVELLE SYNTAXE ts-jest
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          allowJs: true  // ← AJOUTÉ pour jest.env.setup.js
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
  
  // ✅ SUPPRIMÉ - globals deprecated
  // globals: { ... }
};

export default config;