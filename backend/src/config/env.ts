import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file (tự động tìm trong thư mục backend)
// Khi chạy test (NODE_ENV=test), nạp .env.test trước để integration test dùng
// database riêng, tránh ghi/xóa nhầm dữ liệu development.
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
}
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
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
