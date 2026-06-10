const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  REFRESH_TOKEN_SECRET: z.string(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  TOTAL_CAPITAL: z.string().transform(Number).default('200000000'),
  MONTHLY_TARGET_REVENUE: z.string().transform(Number).default('112500000'),
  DAILY_TARGET_VISITORS: z.string().transform(Number).default('150'),
  AVG_TICKET_SIZE: z.string().transform(Number).default('25000'),
  PDF_COMPANY_NAME: z.string().default('GARAGE Coffee & Motor'),
  PDF_COMPANY_ADDRESS: z.string().default('Tebing Tinggi, Sumatera Utara'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

module.exports = _env.data;
