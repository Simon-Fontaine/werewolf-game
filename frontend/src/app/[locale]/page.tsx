import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "next-intl";
import Link from "next/link";

export default function HomePage() {
	const t = useTranslations();

	return (
		<div className="flex min-h-screen flex-col items-center justify-center p-8">
			<main className="w-full max-w-4xl">
				<h1 className="mb-4 text-center text-6xl font-bold">
					{t("common.appName")}
				</h1>
				<p className="mb-12 text-center text-xl text-muted-foreground">
					{t("home.subtitle")}
				</p>
				<LanguageSwitcher />

				<div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
					<Link
						href="/create-game"
						className="rounded-lg bg-primary px-8 py-4 text-center text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t("home.createGameButton")}
					</Link>
					<Link
						href="/join-game"
						className="rounded-lg border border-border bg-background px-8 py-4 text-center text-lg font-semibold transition-colors hover:bg-accent"
					>
						{t("home.joinGameButton")}
					</Link>
				</div>

				<div className="mt-12 text-center">
					<Link
						href="/auth/guest"
						className="text-muted-foreground underline-offset-4 hover:underline"
					>
						{t("auth.continueAsGuest")}
					</Link>
				</div>
			</main>
		</div>
	);
}
