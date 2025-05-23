import path from "node:path";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import middleware from "i18next-http-middleware";

i18next
	.use(Backend)
	.use(middleware.LanguageDetector)
	.init({
		backend: {
			loadPath: path.join(__dirname, "/locales/{{lng}}/{{ns}}.json"),
		},
		fallbackLng: "en",
		preload: ["en", "fr"],
		ns: ["common"],
		defaultNS: "common",
		detection: {
			order: ["header", "querystring", "cookie"],
			caches: ["cookie"],
		},
	});

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
