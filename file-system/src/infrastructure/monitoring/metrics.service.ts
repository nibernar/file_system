import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  async incrementCounter(name: string, labels?: Record<string, string>): Promise<void> {
    // TODO: Implémenter avec Prometheus ou autre système de métriques
    console.log(`Metric: ${name}`, labels);
  }

  async recordHistogram(name: string, value: number, labels?: Record<string, string>): Promise<void> {
    console.log(`Histogram: ${name} = ${value}`, labels);
  }

  async updateGauge(name: string, value: number, labels?: Record<string, string>): Promise<void> {
    console.log(`Gauge: ${name} = ${value}`, labels);
  }
}