import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { BadRequest } from '../utils/errors';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // Reassign normalized/coerced values
      if (source === 'query') {
        (req as unknown as { validatedQuery: unknown }).validatedQuery = parsed;
      } else {
        req[source] = parsed as never;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(BadRequest('Validation failed', err.flatten().fieldErrors));
        return;
      }
      next(err);
    }
  };
}
