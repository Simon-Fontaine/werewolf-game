import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { User } from "../../generated/prisma";

export const getAuthRedirectUrl = (
	currentPath: string,
	locale: string,
): string => {
	const cleanPath = currentPath.replace(`/${locale}`, "") || "/";
	const encodedPath = encodeURIComponent(cleanPath);
	return `/${locale}/auth/guest?redirect=${encodedPath}`;
};

export const requireAuth = (
	user: User | null,
	router: AppRouterInstance,
	currentPath: string,
	locale: string,
) => {
	if (!user) {
		const redirectUrl = getAuthRedirectUrl(currentPath, locale);
		router.push(redirectUrl);
		return false;
	}
	return true;
};
