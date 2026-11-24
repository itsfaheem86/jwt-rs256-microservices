import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  JWT_ISSUER: z.string().min(1).default("https://auth.example.com"),
  JWT_AUDIENCE: z.string().min(1).default("api.example.com"),
  // Directory holding private.pem. Relative paths resolve against the working directory.
  AUTH_KEY_DIR: z.string().min(1).default("keys"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  return result.data;
}

// Runs when the module loads, so a bad configuration stops the process before it listens.
export const env = loadEnv(process.env);
