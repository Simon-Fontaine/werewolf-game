import morgan from "morgan";
import { stream } from "../utils/logger";

export const loggerMiddleware = morgan(
  ":method :url :status :response-time ms - :res[content-length]",
  { stream },
);
