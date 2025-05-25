import { ValidationError } from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validate<T>(schema: ZodSchema<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(new ValidationError("Invalid request data", error));
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = (await schema.parseAsync(req.query)) as T & Request["query"];
      next();
    } catch (error) {
      next(new ValidationError("Invalid query parameters", error));
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = (await schema.parseAsync(req.params)) as T &
        Request["params"];
      next();
    } catch (error) {
      next(new ValidationError("Invalid path parameters", error));
    }
  };
}
