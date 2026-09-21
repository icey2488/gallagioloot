/** Voidcore chip glyph, matching the mockup's stacked-ellipse icon (GallagioLoot Redesign.dc.html). */
export function ChipStack({ count }: { count: number }) {
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 22 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`${count} Voidcores`}
    >
      <ellipse cx="11" cy="13.5" rx="9" ry="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="11" cy="9" rx="9" ry="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="11" cy="4.5" rx="9" ry="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
