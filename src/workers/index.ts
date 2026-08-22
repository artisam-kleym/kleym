/**
 * kleym-worker entrypoint. SPEC.md §2.2.
 *
 * BullMQ consumers and cron jobs are registered here as they land: batch-confirm
 * (#9) is live; reconcile and expiry-sweep (#12), ephemeral-watch (#19) and
 * email-deliver (#14) follow. Kept as a separate process so a slow job never blocks a request.
 */
import { logger } from '@/lib/config/logger'
import { startBatchConfirmWorker } from './batch-confirm'
import { startEmailWorker } from './email'

async function main() {
  const workers = [startBatchConfirmWorker(), startEmailWorker()]
  logger.info({ service: 'kleym-worker', queues: ['batch-confirm', 'email-deliver'] }, 'worker started')

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
