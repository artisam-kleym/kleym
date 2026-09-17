/**
 * kleym-worker entrypoint. SPEC.md §2.2.
 *
 * BullMQ consumers and cron jobs are registered here as they land: batch-confirm
 * (#9), reconcile and expiry-sweep (#12) and ephemeral-watch (#19) are live;
 * email-deliver (#14) follows. Kept as a separate process so a slow job never blocks a request.
 */
import { logger } from '@/lib/config/logger'
import { startBatchConfirmWorker } from './batch-confirm'
import { startEmailWorker } from './email'
import { startWebhookWorker } from './webhooks'
import {
  startEphemeralWatchWorker,
  startExpiryWorker,
  startRetentionWorker,
  startReconcileWorker,
  startReminderWorker,
  startTemplateWorker,
} from './maintenance'
import { scheduleMaintenance } from '@/lib/queue/maintenance'
import { startTelemetry } from '@/lib/observability/telemetry'
import { registerObservables } from '@/lib/observability/metrics'
import { observeWorker } from '@/lib/observability/workers'
import { dependencyReadings, passReadings, queueReadings, sponsorReadings, strandedReading } from '@/lib/observability/status'

async function main() {
  // Traces and metrics leave only when OTEL_EXPORTER_OTLP_ENDPOINT is set (#53).
  // The gauges that need the queues, the ledger and the database live here,
  // in the one process that is always running them.
  if (startTelemetry({ serviceName: 'kleym-worker' })) {
    registerObservables({ queues: queueReadings, sponsors: sponsorReadings, stranded: strandedReading, passes: passReadings, dependencies: dependencyReadings })
  }

  const workers = [
    startBatchConfirmWorker(),
    startEmailWorker(),
    startWebhookWorker(),
    startReconcileWorker(),
    startExpiryWorker(),
    startEphemeralWatchWorker(),
    startRetentionWorker(),
    startReminderWorker(),
    startTemplateWorker(),
  ].map(observeWorker)

  /*
   * Installed on every start, with fixed scheduler ids so a restart or a second
   * replica refreshes the schedule rather than adding another one.
   */
  await scheduleMaintenance()

  logger.info(
    {
      service: 'kleym-worker',
      queues: ['batch-confirm', 'email-deliver', 'webhook-deliver', 'reconcile', 'expiry-sweep', 'ephemeral-watch', 'delivery-retention', 'reminders', 'templates'],
    },
    'worker started',
  )

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    // Let in-flight jobs finish: a batch-confirm killed mid-run leaves links
    // PENDING behind a transaction that is already on the ledger.
    await Promise.all(workers.map((worker) => worker.close()))
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

void main()
