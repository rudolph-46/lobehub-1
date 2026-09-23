import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const getSandboxConfig = () => {
  return createEnv({
    runtimeEnv: {
      ONLYBOXES_BASE_URL: process.env.ONLYBOXES_BASE_URL,
      ONLYBOXES_JIT_ISSUER: process.env.ONLYBOXES_JIT_ISSUER,
      ONLYBOXES_JIT_SIGNING_KEY: process.env.ONLYBOXES_JIT_SIGNING_KEY,
      ONLYBOXES_JIT_TTL_SEC: process.env.ONLYBOXES_JIT_TTL_SEC,
      ONLYBOXES_LEASE_TTL_SEC: process.env.ONLYBOXES_LEASE_TTL_SEC,
      RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN,
      RAILWAY_ENVIRONMENT_ID: process.env.RAILWAY_ENVIRONMENT_ID,
      RAILWAY_SANDBOX_IDLE_TIMEOUT_MINUTES: process.env.RAILWAY_SANDBOX_IDLE_TIMEOUT_MINUTES,
      RAILWAY_SANDBOX_REGION: process.env.RAILWAY_SANDBOX_REGION,
      SANDBOX_PROVIDER: process.env.SANDBOX_PROVIDER,
    },
    server: {
      ONLYBOXES_BASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
      ONLYBOXES_JIT_ISSUER: z.preprocess(emptyStringToUndefined, z.string().optional()),
      ONLYBOXES_JIT_SIGNING_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
      ONLYBOXES_JIT_TTL_SEC: z.preprocess(
        emptyStringToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      ONLYBOXES_LEASE_TTL_SEC: z.preprocess(emptyStringToUndefined, z.coerce.number().optional()),
      RAILWAY_API_TOKEN: z.preprocess(emptyStringToUndefined, z.string().optional()),
      RAILWAY_ENVIRONMENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
      RAILWAY_SANDBOX_IDLE_TIMEOUT_MINUTES: z.preprocess(
        emptyStringToUndefined,
        z.coerce.number().int().min(0).optional(),
      ),
      RAILWAY_SANDBOX_REGION: z.preprocess(emptyStringToUndefined, z.string().optional()),
      SANDBOX_PROVIDER: z.preprocess(
        emptyStringToUndefined,
        z.enum(['market', 'onlyboxes', 'railway']).optional(),
      ),
    },
  });
};

export const sandboxEnv = getSandboxConfig();
