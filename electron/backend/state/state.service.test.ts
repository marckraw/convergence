import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { StateService } from './state.service'

describe('StateService', () => {
  let service: StateService

  beforeEach(() => {
    const db = getDatabase()
    service = new StateService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns null for missing key', () => {
    expect(service.get('nonexistent')).toBeNull()
  })

  it('sets and gets a value', () => {
    service.set('active_project_id', 'abc-123')
    expect(service.get('active_project_id')).toBe('abc-123')
  })

  it('overwrites existing value', () => {
    service.set('key', 'first')
    service.set('key', 'second')
    expect(service.get('key')).toBe('second')
  })

  it('deletes a value', () => {
    service.set('key', 'value')
    service.delete('key')
    expect(service.get('key')).toBeNull()
  })
})
