import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_HEADER = 'x-session-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestWithSession = Request & { sessionId: string };

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const value = req.header(SESSION_HEADER);

    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new BadRequestException(
        `Missing or invalid "${SESSION_HEADER}" header (expected a UUID)`,
      );
    }

    (req as RequestWithSession).sessionId = value.toLowerCase();
    next();
  }
}