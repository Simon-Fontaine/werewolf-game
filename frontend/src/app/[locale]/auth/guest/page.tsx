"use client";

import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export default function GuestAuthPage() {
	const t = useTranslations();
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { createGuest, user, isLoading, error } = useAuthStore();

	const hasInitialized = useRef(false);

	const redirect = searchParams.get("redirect") || `/${locale}`;

	const initializeGuest = useCallback(async () => {
		if (hasInitialized.current || user) return;
		hasInitialized.current = true;

		try {
			await createGuest(locale);
		} catch (err) {
			// Reset if failed
			hasInitialized.current = false;
		}
	}, [createGuest, locale, user]);

	useEffect(() => {
		initializeGuest();
	}, [initializeGuest]);

	useEffect(() => {
		if (user && !isLoading) {
			router.push(redirect);
		}
	}, [user, isLoading, router, redirect]);

	if (isLoading || !user) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("common.loading")}</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-destructive">{error}</p>
					<button
						type="button"
						onClick={() => {
							hasInitialized.current = false;
							initializeGuest();
						}}
						className="mt-4 underline"
					>
						{t("common.retry")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<p>{t("auth.creatingGuestAccount")}</p>
		</div>
	);
}
