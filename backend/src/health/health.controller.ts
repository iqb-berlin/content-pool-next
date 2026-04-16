import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

type HealthPayload = {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  checks?: {
    database: 'up' | 'down';
  };
};

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('live')
  getLiveness(): HealthPayload {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  async getReadiness(): Promise<HealthPayload> {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        checks: {
          database: 'up',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        checks: {
          database: 'down',
        },
      });
    }
  }
}
