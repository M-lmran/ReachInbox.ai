import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { fail } from '../utils/response';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): Response {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err: err.message, path: req.path }, 'Handled server error');
    }
    return fail(res, err.statusCode, err.message, err.code, err.details);
  }

  // Zod errors raised outside the validate() middleware (controller-level
  // schema.parse) are client errors, not server errors.
  if (err instanceof ZodError) {
    return fail(res, 400, 'Validation failed', 'BAD_REQUEST', err.flatten().fieldErrors);
  }

  // Upload limits are client errors, not server faults.
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 5MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many files (max 5)'
          : err.message;
    return fail(res, 400, message, 'BAD_REQUEST');
  }

  // A dependency being unreachable is a 503, not an internal fault. Handled
  // explicitly so we never surface raw driver output (which includes absolute
  // file paths and the generated Prisma invocation) to the client.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error({ path: req.path }, 'Database unavailable');
    return fail(res, 503, 'Database unavailable', 'SERVICE_UNAVAILABLE');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error({ code: err.code, path: req.path }, 'Database request error');
    return fail(res, 400, 'Database request rejected', 'BAD_REQUEST');
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    logger.error({ path: req.path }, 'Database engine error');
    return fail(res, 503, 'Database unavailable', 'SERVICE_UNAVAILABLE');
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  logger.error({ err: message, path: req.path }, 'Unhandled error');
  return fail(
    res,
    500,
    env.NODE_ENV === 'production' ? 'Internal server error' : message,
    'INTERNAL_ERROR',
  );
}

export function notFoundHandler(_req: Request, res: Response): Response {
  return fail(res, 404, 'Route not found', 'NOT_FOUND');
}
