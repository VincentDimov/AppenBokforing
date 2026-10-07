import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";

/** Never log database parameters, uploaded data, cookies, tokens or signed URLs. */
@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<{ headers: Record<string, string | undefined> }>();
    const response = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = req.headers["x-request-id"];
    if (status >= 500)
      process.stderr.write(JSON.stringify({ event: "request_error", requestId, status }) + "\n");
    const body =
      status < 500 && exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error" };
    response
      .status(status)
      .json(
        typeof body === "string" ? { message: body, requestId } : { ...(body as object), requestId }
      );
  }
}
