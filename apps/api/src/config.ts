import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MOCK_MODE: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(10),
  RENDER_QUEUE_CAP: z.coerce.number().default(20),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
