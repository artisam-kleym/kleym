/**
 * /campaigns and /history read through the ownership scope. Issue #40.
 *
 * The clauses are tested on their own because the property that matters —
 * `userId` is IN the where, so search cannot enumerate another user's rows —
 * is a property of the clause, not of a rendered page.
 */
import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_ORDER,
  HISTORY_ORDER,
  campaignListQuerySchema,
  campaignListWhere,
  explorerTxUrl,
  historyQuerySchema,
  historyWhere,
  parseFilters,
} from '@/lib/api/campaign-list'

describe('the campaign list clause', () => {
  it('always carries the organisation, with or without filters', () => {
    expect(campaignListWhere('o1', campaignListQuerySchema.parse({}))).toEqual({ organizationId: 'o1' })
    const filtered = campaignListWhere('o1', campaignListQuerySchema.parse({ q: 'promo', status: 'ACTIVE' }))
    expect(filtered.organizationId).toBe('o1')
    expect(filtered.status).toBe('ACTIVE')
    expect(filtered.name).toEqual({ contains: 'promo', mode: 'insensitive' })
  })

  it('composes search and status with paging', () => {
    const query = campaignListQuerySchema.parse({ q: 'x', status: 'EXPIRED', page: '3', perPage: '10' })
    expect(query).toMatchObject({ q: 'x', status: 'EXPIRED', page: 3, perPage: 10 })
  })

  it('treats an empty select or input as no filter', () => {
    const query = campaignListQuerySchema.parse({ q: '', status: '' })
    expect(query.q).toBeUndefined()
    expect(query.status).toBeUndefined()
  })

  it('refuses an unknown status and an oversized page', () => {
    expect(campaignListQuerySchema.safeParse({ status: 'BOGUS' }).success).toBe(false)
    expect(campaignListQuerySchema.safeParse({ perPage: '1000' }).success).toBe(false)
  })

  // Ties on createdAt are the ordinary case; the id tiebreak is what makes the
  // page stable across loads (acceptance criterion 3).
  it('orders with a total order', () => {
    expect(CAMPAIGN_ORDER).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(HISTORY_ORDER).toEqual([{ claimedAt: 'desc' }, { id: 'desc' }])
  })
})

describe('the history clause', () => {
  it('scopes through the campaign\'s organisation and only settled links', () => {
    const where = historyWhere('o1', historyQuerySchema.parse({}))
    expect(where.campaign).toEqual({ organizationId: 'o1' })
    expect(where.status).toEqual({ in: ['CLAIMED', 'RECLAIMED'] })
    expect(where.claimedAt).toBeUndefined()
  })

  it('keeps the organisation when a campaign is named — the id alone is not authority', () => {
    const where = historyWhere('o1', historyQuerySchema.parse({ campaignId: 'c9' }))
    expect(where.campaign).toEqual({ organizationId: 'o1', id: 'c9' })
  })

  it('reads a `to` date as through the end of that day', () => {
    const where = historyWhere('u1', historyQuerySchema.parse({ from: '2026-09-01', to: '2026-09-12' }))
    const range = where.claimedAt as { gte: Date; lte: Date }
    expect(range.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(range.lte.toISOString()).toBe('2026-09-12T23:59:59.999Z')
  })

  it('refuses a date that is not one', () => {
    expect(historyQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false)
  })
})

describe('the explorer link', () => {
  it('names the network', () => {
    expect(explorerTxUrl('testnet', 'ab'.repeat(32))).toBe(`https://stellar.expert/explorer/testnet/tx/${'ab'.repeat(32)}`)
    expect(explorerTxUrl('public', 'h')).toBe('https://stellar.expert/explorer/public/tx/h')
  })
})

describe('parsing a filter form', () => {
  it('drops only the field that failed and keeps the rest', () => {
    const query = parseFilters(historyQuerySchema, { campaignId: 'c1', from: 'yesterday', to: '2026-09-12', page: '2' })
    expect(query.campaignId).toBe('c1')
    expect(query.from).toBeUndefined()
    expect(query.to?.toISOString()).toBe('2026-09-12T00:00:00.000Z')
    expect(query.page).toBe(2)
  })

  it('falls back to defaults for a bad page and an unknown status', () => {
    const query = parseFilters(campaignListQuerySchema, { q: 'promo', status: 'BOGUS', page: 'x', perPage: '1000' })
    expect(query).toEqual({ q: 'promo', status: undefined, page: 1, perPage: 25 })
  })
})
