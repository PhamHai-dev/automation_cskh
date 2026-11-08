import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';

// Resolve env files from the backend project, not from process.cwd().
// This keeps `node backend/dist/server.js` and IDE launchers consistent with
// `npm run dev` executed from backend/.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envCandidates = [
  path.resolve(__dirname, '../..'), // src/config -> backend, or dist/config -> repository root
  path.resolve(__dirname, '../../backend'), // compiled dist/config -> backend
];
const backendRoot = envCandidates.find((root) => fs.existsSync(path.join(root, envFile)));
if (backendRoot) {
  dotenv.config({ path: path.join(backendRoot, envFile) });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().refine(
    (value) => value.startsWith('mysql://'),
    'DATABASE_URL phải dùng protocol mysql:// vì datasource Prisma đang dùng MySQL',
  ),
  REDIS_ENABLED: z.string().default('false'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ZALO_SESSION_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables', _env.error.format());
  process.exit(1);
}

export const env = {
  ..._env.data,
  ZALO_SESSION_SECRET: _env.data.ZALO_SESSION_SECRET || _env.data.JWT_SECRET,
};
