import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReportUrlRows } from '../src/components/ReportUrlRows'

const noop = () => {}
function render(status: Parameters<typeof ReportUrlRows>[0]['status'] = {}) {
  const div = document.createElement('div')
  div.innerHTML = renderToStaticMarkup(
    createElement(ReportUrlRows, { rows: [{ id: 0, url: '' }, { id: 1, url: 'x' }], status, issues: {}, hasLoaded: false, onChange: noop, onBlur: noop, onAdd: noop, onRemove: noop })
  )
  return div
}

describe('ReportUrlRows: per-row live region', () => {
  it('every row has an always-rendered polite status region the input points to with aria-describedby', () => {
    const div = render()
    const inputs = [...div.querySelectorAll('input')]
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      const id = input.getAttribute('aria-describedby')!
      const region = div.querySelector(`#${id}`)!
      expect(region.getAttribute('role')).toBe('status')
      expect(region.getAttribute('aria-live')).toBe('polite')
    }
    expect(inputs.map((i) => i.getAttribute('aria-describedby'))).toEqual(['report-url-status', 'report-url-2-status'])
  })

  it('the same region carries the fetch result', () => {
    const div = render({ 0: { state: 'error', message: 'Report not found' } })
    expect(div.querySelector('#report-url-status')?.textContent).toBe('Report not found')
  })
})
