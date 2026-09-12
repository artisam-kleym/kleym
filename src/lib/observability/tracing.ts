/**
 * Spans, with every attribute passed through `safeAttributes`. Issue #53.
 *
 * `@opentelemetry/api` is safe to import without an SDK: with none
 * registered every call is a no-op, so the request path and the workers
 * carry these calls in every environment and a deployment turns them on by
 * setting OTEL_EXPORTER_OTLP_ENDPOINT (see telemetry.ts).
 */
import { context, propagation, trace, SpanKind, SpanStatusCode, type Context, type Span } from '@opentelemetry/api'
import { logger } from '@/lib/config/logger'
import { safeAttributes } from './attributes'

const tracer = () => trace.getTracer('kleym')

function apply(span: Span, attrs: Record<string, unknown> | undefined): void {
  const { attributes, dropped } = safeAttributes(attrs)
  if (dropped.length > 0) logger.warn({ dropped }, 'span attributes dropped by the allowlist')
  span.setAttributes(attributes)
}

/**
 * Runs `work` inside a span named `name`, as a child of whatever is active —
 * a Next.js request span, or a worker job span. Attributes go through the
 * allowlist; a thrown error marks the span and is rethrown.
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown> | undefined,
  work: (span: Span) => Promise<T>,
  opts: { kind?: SpanKind; parent?: Context } = {},
): Promise<T> {
  const parent = opts.parent ?? context.active()
  return tracer().startActiveSpan(name, { kind: opts.kind ?? SpanKind.INTERNAL }, parent, async (span) => {
    apply(span, attrs)
    try {
      const result = await work(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      apply(span, { 'error.type': error instanceof Error ? error.name : 'Error' })
      throw error
    } finally {
      span.end()
    }
  })
}

/** Adds attributes to the CURRENT span, allowlisted. No-op without one. */
export function annotateSpan(attrs: Record<string, unknown>): void {
  const span = trace.getSpan(context.active())
  if (span) apply(span, attrs)
}

/**
 * The W3C `traceparent` / `tracestate` of the active context, for a job
 * payload — so a worker's span joins the request that enqueued it. Empty
 * when nothing is active or no SDK is registered.
 */
export function traceCarrier(): Record<string, string> {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier
}

/** The context a carrier describes; the root context when it carries nothing. */
export function contextFromCarrier(carrier: Record<string, string> | undefined): Context {
  return propagation.extract(context.active(), carrier ?? {})
}

export { SpanKind }
