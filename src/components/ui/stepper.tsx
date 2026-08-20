import { clsx } from 'clsx'
import { Icon } from './icon'

export interface Step {
  title: string
  /** A short summary of the value chosen at this step. BRAND.md §5.6. */
  summary?: string
}

export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const state = index < current ? 'complete' : index === current ? 'active' : 'future'
        const isLast = index === steps.length - 1
        return (
          <li
            key={step.title}
            aria-current={state === 'active' ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-md py-md',
              // §5.6: completed and active steps carry a bottom border; the
              // final step does not.
              !isLast && state !== 'future' && 'border-b border-outline-variant/40',
            )}
          >
            <span
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-[50%] border',
                'font-mono text-label-sm',
                state === 'complete' && 'border-outline-variant bg-accent-yellow text-on-surface',
                state === 'active' && 'border-primary bg-primary text-on-primary',
                state === 'future' && 'border-outline-variant bg-surface-variant opacity-50',
              )}
            >
              {state === 'complete' ? <Icon name="check_circle" size={18} filled /> : index + 1}
            </span>
            <span className="flex flex-col">
              <span className="font-mono text-label-md text-on-surface">{step.title}</span>
              {step.summary && (
                <span className="font-mono text-label-sm text-on-surface-variant">{step.summary}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
