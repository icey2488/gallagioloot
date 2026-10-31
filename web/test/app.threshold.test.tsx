import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { parseThreshold } from '../src/lib/format'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('parseThreshold', () => {
  it('accepts finite non-negative numbers only', () => {
    expect(parseThreshold('0.35')).toBe(0.35)
    expect(parseThreshold('0')).toBe(0)
    expect(parseThreshold('')).toBeNull()
    expect(parseThreshold('  ')).toBeNull()
    expect(parseThreshold('-1')).toBeNull()
    expect(parseThreshold('abc')).toBeNull()
  })
})

describe('Threshold % input', () => {
  it('has min=0, keeps the last valid value while empty, and shows it again on blur', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    const input = container.querySelector('#threshold') as HTMLInputElement
    expect(input.min).toBe('0')
    expect(input.value).toBe('0.2')
    await act(async () => {
      Simulate.change(input, { target: { value: '0.5' } as unknown as EventTarget })
    })
    await act(async () => {
      Simulate.change(input, { target: { value: '' } as unknown as EventTarget })
    })
    // Mid-edit the field may be empty, but the applied threshold stays 0.5 (not 0).
    await act(async () => {
      Simulate.blur(input)
    })
    expect(input.value).toBe('0.5')
    await act(async () => {
      Simulate.change(input, { target: { value: '-3' } as unknown as EventTarget })
    })
    await act(async () => {
      Simulate.blur(input)
    })
    expect(input.value).toBe('0.5')
  })
})
