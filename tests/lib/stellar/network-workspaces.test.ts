import { expect, it } from 'vitest'
import { networkWorkspaces, workspaceOrigin } from '@/lib/stellar/network-workspaces'
import { computeCost, affordability } from '@/lib/campaign/cost'

it('keeps unavailable Mainnet explicit and prevents same-origin cross-network navigation', () => {
  expect(networkWorkspaces('testnet', 'https://kleym-test.example', '', '')).toEqual({ testnet: 'https://kleym-test.example', public: null })
  expect(networkWorkspaces('testnet', 'https://kleym-test.example', '', 'https://kleym-test.example')).toHaveProperty('public', null)
  expect(networkWorkspaces('testnet', 'https://kleym-test.example', '', 'https://kleym-live.example')).toHaveProperty('public', 'https://kleym-live.example')
  expect(networkWorkspaces('public', 'https://kleym-live.example', 'https://kleym-test.example', '')).toEqual({ public: 'https://kleym-live.example', testnet: 'https://kleym-test.example' })
})

it('rejects private, credentialled or query/fragment-bearing workspace destinations', () => {
  for (const raw of ['http://kleym.example', 'https://localhost', 'https://127.0.0.1', 'https://user:private@kleym.example', 'https://kleym.example/claim#private', 'https://kleym.example/?token=private', 'not a URL']) expect(workspaceOrigin(raw)).toBeNull()
})

it('allows prizes larger than the superseded pilot proposal when spendable principal covers them', () => {
  const cost = computeCost({ amountPerLink: '20', amounts: ['20', '15', '10', null], linkCount: 4,
    reservePerLink: '1', maxOpsPerBatch: 90, baseFeeStroops: '1000', sponsored: true })
  expect(cost.totalAmount).toBe('65')
  expect(affordability(cost, { assetBalance: '65', xlmBalance: '0' }, false)).toEqual({ asset: true, reserve: true })
  expect(affordability(cost, { assetBalance: '64.9999999', xlmBalance: '0' }, false).asset).toBe(false)
})
