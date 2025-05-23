import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
	en: "English",
	fr: "Français",
};

export default getRequestConfig(async ({ requestLocale }) => {
	const locale = await requestLocale;

	if (!locale || !locales.includes(locale as Locale)) {
		notFound();
	}

	return {
		locale,
		messages: (await import(`./locales/${locale}.json`)).default,
	};
});
