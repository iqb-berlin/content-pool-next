import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, catchError, tap, throwError } from "rxjs";
import {
  SERVER_API_AUDIT_KEY,
  ServerApiAuditMetadata,
} from "./server-api-audit.decorator";
import { ServerApiAuditService } from "./server-api-audit.service";

@Injectable()
export class ServerApiAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: ServerApiAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMeta = this.reflector.getAllAndOverride<ServerApiAuditMetadata>(
      SERVER_API_AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditMeta) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const baseEntry = {
      clientId: req?.serverApiClient?.id || "unknown",
      action: auditMeta.action,
      method: req?.method || "UNKNOWN",
      path: req?.originalUrl || req?.url || "",
      acpId: req?.params?.acpId,
      resourceId: req?.params?.fileId || req?.params?.acpId,
      details: {
        resourceType: auditMeta.resourceType,
        query: req?.query || {},
      },
    };

    return next.handle().pipe(
      tap(() => {
        void this.auditService.log({
          ...baseEntry,
          success: true,
          statusCode: res?.statusCode,
        });
      }),
      catchError((error) => {
        void this.auditService.log({
          ...baseEntry,
          success: false,
          statusCode: error?.status || 500,
          details: {
            ...(baseEntry.details || {}),
            errorMessage: error?.message || "Unknown error",
          },
        });

        return throwError(() => error);
      }),
    );
  }
}
