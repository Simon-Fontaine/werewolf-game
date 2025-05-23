"use client";

import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GuestAuthPage() {
	const t = useTranslations();
	const locale = useLocale();
	const router = useRouter();
	const { createGuest, user, isLoading, error } = useAuthStore();

	useEffect(() => {
		if (!user) {
			createGuest(locale);
		}
	}, [user, createGuest, locale]);

	useEffect(() => {
		if (user) {
			router.push(`/${locale}`);
		}
	}, [user, router, locale]);

	if (isLoading) {
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
						onClick={() => createGuest(locale)}
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
