import { z } from "zod";

export const emailSchema = z.string().email().max(100);
export const usernameSchema = z
	.string()
	.min(3)
	.max(30)
	.regex(/^[a-zA-Z0-9_-]+$/);
export const passwordSchema = z.string().min(8);
export const localeSchema = z.enum(["en", "fr"]).default("en");

export const registerSchema = z.object({
	email: emailSchema,
	username: usernameSchema,
	password: passwordSchema,
	locale: localeSchema.optional(),
});

export const loginSchema = z.object({
	username: z.string(),
	password: z.string(),
});

export const createGuestSchema = z.object({
	locale: localeSchema.optional(),
});

export const refreshTokenSchema = z.object({
	refreshToken: z.string(),
});

export const convertGuestSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});

export const updateProfileSchema = z.object({
	locale: localeSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ConvertGuestInput = z.infer<typeof convertGuestSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
