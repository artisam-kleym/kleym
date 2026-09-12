/**
 * OpenTelemetry bootstrap. Issue #53.
 *
 * Export OTLP and let the deployment decide the backend: with
 * OTEL_EXPORTER_OTLP_ENDPOINT set, traces and metrics go there over
 * OTLP/HTTP; without it nothing is registered and every span and metric
 * call in the codebase is a no-op. Scripts pass their own exporters.
 *
 * Called from src/instrumentation.ts (the web process; Next.js emits its own
 * request spans once a provider is registered) and src/workers/index.ts.
 */
import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader, type MetricReader } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'

export interface TelemetryOptions {
  serviceName: 'kleym-web' | 'kleym-worker' | string
  /** Scripts: exporters of their own instead of OTLP. */
  spanProcessors?: SpanProcessor[]
  metricReader?: MetricReader
}

let sdk: NodeSDK | undefined

/** Idempotent. Returns whether telemetry is on. */
export function startTelemetry(opts: TelemetryOptions): boolean {
  if (sdk) return true
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
  const custom = opts.spanProcessors !== undefined || opts.metricReader !== undefined
  if (!endpoint && !custom) return false

  const spanProcessors = opts.spanProcessors ?? [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }))]
  const metricReader =
    opts.metricReader ??
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: env.OTEL_METRIC_EXPORT_INTERVAL_MS,
    })

  sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: opts.serviceName, [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0' }),
    spanProcessors,
    metricReader,
  })
  sdk.start()
  logger.info({ service: opts.serviceName, exporter: custom ? 'custom' : 'otlp/http' }, 'telemetry started')
  return true
}

export async function stopTelemetry(): Promise<void> {
  await sdk?.shutdown()
  sdk = undefined
}
