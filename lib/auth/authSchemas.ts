import { z } from "zod";

/**
 * Terminal web contract (index-BXT1oMOW.js):
 * - POST /api/auth/login → flat { token, user, access }
 * - GET /api/auth/me → flat { authenticated?, user, access?, saasDisabled? }
 * - Errors → { error: string }
 * Token field name: `token` (stored in localStorage, sent as Bearer)
 */
export const authUserSchema = z.object({
  id: z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "string" ? Number(value) : value))
    .pipe(z.number().finite()),
  email: z.string(),
  role: z.string().optional(),
  emailVerified: z.boolean().optional(),
  fullName: z.string().nullable().optional(),
});

export type ParsedAuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: authUserSchema,
  access: z.record(z.unknown()).nullable().optional(),
  requiresEmailVerification: z.boolean().optional(),
});

export const meResponseSchema = z.object({
  authenticated: z.boolean().optional(),
  user: authUserSchema.nullable().optional(),
  access: z.record(z.unknown()).nullable().optional(),
  saasDisabled: z.boolean().optional(),
});

export type ParsedLoginResponse = z.infer<typeof loginResponseSchema>;
export type ParsedMeResponse = z.infer<typeof meResponseSchema>;
