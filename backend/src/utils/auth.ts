import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_REFRESH_SECRET =
	process.env.JWT_REFRESH_SECRET || "your-refresh-secret";

export interface TokenPayload {
	userId: string;
	username: string;
	isGuest: boolean;
}

export const hashPassword = async (password: string): Promise<string> => {
	return bcrypt.hash(password, 10);
};

export const comparePassword = async (
	password: string,
	hash: string,
): Promise<boolean> => {
	return bcrypt.compare(password, hash);
};

export const generateAccessToken = (payload: TokenPayload): string => {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
	return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });
};

export const verifyAccessToken = (token: string): TokenPayload => {
	return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
	return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
};

export const generateGuestUsername = (): string => {
	const adjectives = ["Swift", "Clever", "Mystic", "Silent", "Brave"];
	const nouns = ["Wolf", "Villager", "Hunter", "Seer", "Guardian"];
	const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
	const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
	const randomNum = Math.floor(Math.random() * 9999);
	return `${randomAdj}${randomNoun}${randomNum}`;
};
