import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map } from "rxjs";

@Injectable()
export class ReviewSnapshotInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    response.setHeader("Cache-Control", "private, no-cache");
    response.setHeader("Vary", "Authorization");
    return next.handle().pipe(
      map((snapshot) => {
        if (request.method !== "GET" || !snapshot?.revision) return snapshot;
        const etag = `"${snapshot.revision}"`;
        response.setHeader("ETag", etag);
        if (request.headers["if-none-match"] === etag) {
          response.status(304);
          return undefined;
        }
        return snapshot;
      }),
    );
  }
}
