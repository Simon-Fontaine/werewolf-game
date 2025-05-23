"use client";

import { localeNames, locales } from "@/i18n/request";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

export function LanguageSwitcher() {
	const router = useRouter();
	const pathname = usePathname();
	const locale = useLocale();

	const handleChange = (newLocale: string) => {
		const pathWithoutLocale =
			pathname.replace(new RegExp(`^/${locale}`), "") || "/";
		const newPath = `/${newLocale}${pathWithoutLocale}`;
		router.push(newPath);
	};

	return (
		<select
			value={locale}
			onChange={(e) => handleChange(e.target.value)}
			className="rounded-md border border-input bg-background px-3 py-1 text-sm"
		>
			{locales.map((loc) => (
				<option key={loc} value={loc}>
					{localeNames[loc]}
				</option>
			))}
		</select>
	);
}
