/**
 * Next.js instrumentation hook — runs once per server process. Issue #53.
 *
 * Registers the OpenTelemetry SDK for the web process when an OTLP endpoint
 * is configured. Next.js then emits its own spans for every request and
 * route handler, and the `withSpan` calls on the claim path nest under them.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startTelemetry } = await import('@/lib/observability/telemetry')
  const { registerObservables } = await import('@/lib/observability/metrics')
  const { dependencyReadings } = await import('@/lib/observability/status')
  if (startTelemetry({ serviceName: 'kleym-web' })) {
    registerObservables({ dependencies: dependencyReadings })
  }
}
