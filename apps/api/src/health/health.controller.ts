import { Controller, Get, Header, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../auth/decorators/public.decorator";

export interface HealthResponse {
  service: "ledgerapp-api";
  status: "ok";
  timestamp: string;
}

@ApiTags("System")
@Controller("health")
export class HealthController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Return API liveness status" })
  @ApiOkResponse({
    description: "The API process is running.",
    schema: {
      type: "object",
      required: ["status", "service", "timestamp"],
      properties: {
        status: {
          type: "string",
          example: "ok"
        },
        service: {
          type: "string",
          example: "ledgerapp-api"
        },
        timestamp: {
          type: "string",
          format: "date-time"
        }
      }
    }
  })
  getHealth(): HealthResponse {
    return {
      service: "ledgerapp-api",
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}
