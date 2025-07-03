import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthCheckService {
  async checkHealth(): Promise<any> {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }
}