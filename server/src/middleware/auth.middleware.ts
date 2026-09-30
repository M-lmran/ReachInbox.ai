import { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { Unauthorized } from '../utils/errors';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    next(Unauthorized('Missing bearer token'));
    return;
  }
  const user = await authService.resolveToken(token);
  if (!user) {
    next(Unauthorized('Invalid or expired token'));
    return;
  }
  req.user = user;
  next();
}
