/**
 * kleym-worker entrypoint. SPEC.md §2.2.
 *
 * BullMQ consumers and cron jobs are registered here as they land: batch-confirm
 * (#9), reconcile and expiry-sweep (#12), ephemeral-watch (#19), email-deliver
 * (#14). Kept as a separate process so a slow job never blocks a request.
 */
import { logger } from '@/lib/config/logger'

async function main() {
  logger.info({ service: 'kleym-worker' }, 'worker started — no queues registered yet')

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down')
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

void main()
