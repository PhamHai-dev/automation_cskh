// Jest setup: ensure test environment variables are loaded before app code imports env.ts
process.env.NODE_ENV = 'test';

const dotenv = require('dotenv');
const path = require('path');

// Load test-specific env first (overrides .env for test runs)
dotenv.config({ path: path.resolve(__dirname, '.env.test') });
// Then load .env (does not override already-set vars)
dotenv.config({ path: path.resolve(__dirname, '.env') });
