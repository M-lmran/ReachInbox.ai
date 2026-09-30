import { Response } from 'express';
import { Pagination } from '../types';

export function ok<T>(res: Response, data: T, pagination?: Pagination, status = 200): Response {
  return res.status(status).json({ success: true, data, ...(pagination ? { pagination } : {}) });
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, undefined, 201);
}

export function fail(res: Response, status: number, message: string, code = 'ERROR', details?: unknown): Response {
  return res.status(status).json({ success: false, error: { message, code, details } });
}
