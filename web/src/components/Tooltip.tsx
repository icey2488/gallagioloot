import { useId, useState, type ReactNode } from 'react'
import { GLOSSARY, type GlossaryTerm } from '../lib/glossary'

let tooltipSeq = 0

/**
 * Wraps a term with an accessible tooltip: shows on hover or keyboard focus, dismissible
 * with Escape, described via aria-describedby (not aria-label, so the underlying text
 * stays in the accessibility tree). Deliberately styled with the same steel-blue palette
 * as the rest of the UI -- gold is reserved for the recommendation card only.
 */
export function Tooltip({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const reactId = useId()
  const idRef = `tooltip-${reactId}-${++tooltipSeq}`
  const entry = GLOSSARY[term]

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <span className="tooltip-wrap">
      <button
        type="button"
        className="tooltip-trigger"
        aria-describedby={open ? idRef : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      >
        {children ?? entry.label}
        <span className="tooltip-icon" aria-hidden="true">
          ⓘ
        </span>
      </button>
      {open && (
        <span role="tooltip" id={idRef} className="tooltip-bubble">
          {entry.copy}
        </span>
      )}
    </span>
  )
}
