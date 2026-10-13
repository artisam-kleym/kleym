import { clsx } from 'clsx'
import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  helper?: string
  /** Right-aligned computed total, e.g. a reserve cost. BRAND.md §5.4. */
  total?: string
  error?: string
}

export function Input({
  label,
  helper,
  total,
  error,
  className,
  id,
  ...props
}: InputProps) {
  const generated = useId()
  const inputId = id ?? generated
  const helperId = `${inputId}-helper`

  return (
    <div className="flex min-w-0 flex-col gap-xs">
      <label
        htmlFor={inputId}
        className="input-label font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={helper || error || total ? helperId : undefined}
        aria-invalid={error ? true : undefined}
        className={clsx(
          // `outline`, not `outline-variant`: a form field's border is what
          // identifies the control, so it needs 3:1 (WCAG 1.4.11).
          // outline-variant measures 1.55:1 here; outline measures 4.06:1.
          'input-glow rounded-lg border border-outline bg-surface-container-low',
          'min-h-11 w-full min-w-0 max-w-full px-4 py-3 font-mono text-body-md text-on-surface md:text-label-md',
          'transition-colors duration-200',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {(helper || error || total) && (
        <div
          id={helperId}
          className="flex justify-between font-mono text-label-sm"
        >
          <span className={error ? 'text-error' : 'text-on-surface-variant'}>
            {error ?? helper}
          </span>
          {total && <span className="text-primary">{total}</span>}
        </div>
      )}
    </div>
  )
}
