import { deserialize, serialize } from '@engine/core/knockout'
import type { StorageAdapter } from '@engine/core/knockout'
import type { KnockoutState } from '@engine/core/types'

/**
 * Browser localStorage implementation of the core StorageAdapter interface.
 * Browser APIs stay out of src/core -- this is the frontend-side adapter.
 * `key` is always the string produced by core's `storageKey()`.
 */
const NS = 'gallagioloot'
const KNOCKOUT_PREFIX = `${NS}:knockout:`
const SETTINGS_PREFIX = `${NS}:settings:`
const LAST_URL_PREFIX = `${NS}:lastUrl:`
const VOIDCORE_PREFIX = `${NS}:voidcore:`

export class LocalStorageAdapter implements StorageAdapter {
  async load(key: string): Promise<KnockoutState | null> {
    const raw = localStorage.getItem(KNOCKOUT_PREFIX + key)
    if (!raw) return null
    try {
      return deserialize(raw)
    } catch {
      return null
    }
  }

  async save(key: string, state: KnockoutState): Promise<void> {
    localStorage.setItem(KNOCKOUT_PREFIX + key, serialize(state))
  }

  async list(): Promise<string[]> {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KNOCKOUT_PREFIX)) keys.push(k.slice(KNOCKOUT_PREFIX.length))
    }
    return keys.sort()
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(KNOCKOUT_PREFIX + key)
  }
}

export type StoredSettings = {
  thresholdPct: number
  rollsAvailable: 1 | 2
}

export const DEFAULT_STORED_SETTINGS: StoredSettings = {
  thresholdPct: 0.2,
  rollsAvailable: 1,
}

function readJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadSettings(key: string): StoredSettings {
  return readJSON<StoredSettings>(SETTINGS_PREFIX + key) ?? DEFAULT_STORED_SETTINGS
}

export function saveSettings(key: string, settings: StoredSettings): void {
  localStorage.setItem(SETTINGS_PREFIX + key, JSON.stringify(settings))
}

export function loadLastReportUrl(key: string): string | null {
  return localStorage.getItem(LAST_URL_PREFIX + key)
}

export function saveLastReportUrl(key: string, url: string): void {
  localStorage.setItem(LAST_URL_PREFIX + key, url)
}

export function loadVoidcoreCount(key: string): number {
  const raw = localStorage.getItem(VOIDCORE_PREFIX + key)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function saveVoidcoreCount(key: string, count: number): void {
  localStorage.setItem(VOIDCORE_PREFIX + key, String(Math.max(0, Math.floor(count))))
}
