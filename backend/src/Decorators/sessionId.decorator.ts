
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithSession } from '../Middlewares/session.middleware';
 
export const SessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<RequestWithSession>().sessionId,
);
 