import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Role } from "@shared/types";
import { useTranslations } from "next-intl";

interface RoleCardProps {
	role: Role;
}

export function RoleCard({ role }: RoleCardProps) {
	const t = useTranslations();

	const getRoleColor = () => {
		switch (role) {
			case Role.WEREWOLF:
				return "border-red-600 bg-red-50 dark:bg-red-950";
			case Role.SEER:
				return "border-purple-600 bg-purple-50 dark:bg-purple-950";
			case Role.DOCTOR:
				return "border-green-600 bg-green-50 dark:bg-green-950";
			case Role.HUNTER:
				return "border-orange-600 bg-orange-50 dark:bg-orange-950";
			case Role.WITCH:
				return "border-violet-600 bg-violet-50 dark:bg-violet-950";
			default:
				return "border-blue-600 bg-blue-50 dark:bg-blue-950";
		}
	};

	return (
		<Card className={`${getRoleColor()}`}>
			<CardHeader>
				<CardTitle>{t(`game.roles.${role.toLowerCase()}.name`)}</CardTitle>
				<CardDescription>
					{t("game.messages.yourRole", {
						role: t(`game.roles.${role.toLowerCase()}.name`),
					})}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm">
					{t(`game.roles.${role.toLowerCase()}.description`)}
				</p>
			</CardContent>
		</Card>
	);
}
