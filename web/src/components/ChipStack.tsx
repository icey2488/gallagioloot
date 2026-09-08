/** Original chip-stack glyph for a Voidcore count -- not a copy of the in-game icon. Purely iconographic; render the count alongside it. */
export function ChipStack({ count }: { count: number }) {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" xmlns="http://www.w3.org/2000/svg" aria-label={`${count} Voidcores`}>
      <rect x="1" y="11" width="20" height="5" rx="2.5" className="chip-stack__bar" />
      <rect x="3" y="6" width="16" height="5" rx="2.5" className="chip-stack__bar chip-stack__bar--mid" />
      <rect x="5" y="1" width="12" height="5" rx="2.5" className="chip-stack__bar chip-stack__bar--top" />
    </svg>
  )
}
