/**
 * Job duration per queue, from BullMQ's own timestamps. Issue #53.
 *
 * Attached to every worker at start rather than written into each
 * processor, so a queue added later is measured by default.
 */
import type { Worker } from 'bullmq'
import { recordJobDuration } from './metrics'

function seconds(job: { processedOn?: number; finishedOn?: number } | undefined): number | null {
  if (!job?.processedOn) return null
  return Math.max(0, ((job.finishedOn ?? Date.now()) - job.processedOn) / 1000)
}

export function observeWorker<W extends Worker>(worker: W): W {
  worker.on('completed', (job) => {
    const took = seconds(job)
    if (took !== null) recordJobDuration(worker.name, 'completed', took)
  })
  worker.on('failed', (job) => {
    const took = seconds(job ?? undefined)
    if (took !== null) recordJobDuration(worker.name, 'failed', took)
  })
  return worker
}
