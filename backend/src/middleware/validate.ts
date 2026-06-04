import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, source: ValidationTarget = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message
        }));
        console.error('[DEBUG ERROR] Validation failed for', req.method, req.originalUrl, '- body:', JSON.stringify(req[source]), '- issues:', JSON.stringify(details));
        _res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details
        });
        return;
      }
      next(error);
    }
  };
};
