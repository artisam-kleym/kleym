/**
 * kleym-worker entrypoint. SPEC.md §2.2.
 *
 * BullMQ consumers and cron jobs are registered here as they land: batch-confirm
 * (#9), reconcile and expiry-sweep (#12) and ephemeral-watch (#19) are live;
 * email-deliver (#14) follows. Kept as a separate process so a slow job never blocks a request.
 */
import { logger } from '@/lib/config/logger'
import { startBatchConfirmWorker } from './batch-confirm'
import {
  startEphemeralWatchWorker,
  startExpiryWorker,
  startReconcileWorker,
} from './maintenance'
import { scheduleMaintenance } from '@/lib/queue/maintenance'

async function main() {
  const workers = [
    startBatchConfirmWorker(),
    startReconcileWorker(),
    startExpiryWorker(),
    startEphemeralWatchWorker(),
  ]

  /*
   * Installed on every start, with fixed scheduler ids so a restart or a second
   * replica refreshes the schedule rather than adding another one.
   */
  await scheduleMaintenance()

  logger.info(
    {
      service: 'kleym-worker',
      queues: ['batch-confirm', 'reconcile', 'expiry-sweep', 'ephemeral-watch'],
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
