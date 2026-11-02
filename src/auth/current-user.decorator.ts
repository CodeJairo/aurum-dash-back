import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const CurrentCompanyId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.companyId) {
      throw new ForbiddenException('Contexto de empresa (tenant) no encontrado o inválido.');
    }
    return user.companyId as string;
  },
);
