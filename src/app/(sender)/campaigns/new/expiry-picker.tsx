'use client'

import { useId } from 'react'
import { Button, Input } from '@/components/ui'
import { EXPIRY_PRESETS, expiryDescription, localExpiry, presetExpiry, type ExpiryChoice } from '@/lib/campaign/expiry'

export function ExpiryPicker({ value, choice, error, onChange }: {
  value: string
  choice: ExpiryChoice
  error: string | null
  onChange: (value: string, choice: ExpiryChoice) => void
}) {
  const id = useId()
  const clock = value.length > 16 && Number.isFinite(new Date(value).getTime()) ? localExpiry(new Date(value)) : value
  const [date = '', time = ''] = clock.split('T')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <fieldset className="min-w-0 rounded-lg border border-outline-variant bg-surface-container-low p-md">
      <legend className="px-xs font-mono text-label-md text-on-surface">When should links expire?</legend>
      <p className="mb-md text-body-md text-on-surface-variant">
        Pick a duration from now, or enter your own deadline.
      </p>
      <div className="grid grid-cols-2 gap-xs sm:grid-cols-5" aria-label="Expiry choices">
        {EXPIRY_PRESETS.map((preset) => (
          <Button key={preset.id} type="button" variant={choice === preset.id ? 'primary' : 'secondary'}
            aria-pressed={choice === preset.id} className="min-h-11 px-xs"
            onClick={() => onChange(presetExpiry(preset.id), preset.id)}>
            {preset.label}
          </Button>
        ))}
        <Button type="button" variant={choice === 'custom' ? 'primary' : 'secondary'}
          aria-pressed={choice === 'custom'} className="min-h-11 px-xs"
          onClick={() => onChange(value, 'custom')}>
          Custom
        </Button>
      </div>
      {choice === 'custom' && (
        <div className="mt-md grid min-w-0 grid-cols-1 gap-md sm:grid-cols-2">
          <Input label="Expiry date" name="expiryDate" type="date" value={date} required
            className="min-w-0 w-full" aria-invalid={!!error} aria-describedby={`${id}-deadline`}
            onChange={(event) => onChange(`${event.target.value}T${time}`, 'custom')} />
          <Input label="Expiry time" name="expiryTime" type="time" step={60} value={time} required
            className="min-w-0 w-full" aria-invalid={!!error} aria-describedby={`${id}-deadline`}
            onChange={(event) => onChange(`${date}T${event.target.value}`, 'custom')} />
          <p className="text-body-md text-on-surface-variant sm:col-span-2">
            Type a date and time, or use the pickers. Timezone: {timezone}.
          </p>
        </div>
      )}
      <div id={`${id}-deadline`} className="mt-md border-t border-outline-variant pt-md" aria-live="polite">
        <p className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Exact deadline</p>
        {error ? (
          <p className="mt-xs text-body-md text-error">{error}</p>
        ) : (
          <p className="mt-xs break-words text-body-md text-on-surface" data-testid="expiry-deadline">{expiryDescription(value)}</p>
        )}
        <p className="mt-xs text-body-md text-on-surface-variant">
          This deadline stays fixed while you create the campaign. After it passes, open the campaign and sign Reclaim to return unused funds. Refunds require your wallet approval; they are not automatic.
        </p>
      </div>
    </fieldset>
  )
}
