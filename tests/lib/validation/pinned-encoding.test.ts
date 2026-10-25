import { beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { pinnedFetch } from '@/lib/validation/pinned-fetch'

const fixture = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('node:https', () => ({ request: fixture.request }))
beforeEach(() => fixture.request.mockReset())

it.each(['br', 'gzip', 'deflate', 'identity,br', ''])('refuses %s at raw HTTPS headers before buffering data', async (encoding) => {
  const incoming = Object.assign(Readable.from([Buffer.from('untrusted bytes')]), { statusCode: 200, headers: { 'content-encoding': encoding } })
  const destroy = vi.spyOn(incoming, 'destroy')
  fixture.request.mockImplementation((_url, _options, receive: (response: typeof incoming) => void) => Object.assign(new EventEmitter(), {
    end: () => queueMicrotask(() => receive(incoming)),
  }))
  await expect(pinnedFetch('https://federation.example.com/', {})).rejects.toThrow('Outbound destination or transport refused.')
  expect(destroy).toHaveBeenCalled()
  expect(incoming.listenerCount('data')).toBe(0)
  expect(fixture.request.mock.calls[0]![1].headers['accept-encoding']).toBe('identity')
})

it.each([undefined, 'identity'])('accepts an uncompressed raw HTTPS response with %s', async (encoding) => {
  const incoming = Object.assign(Readable.from([Buffer.from('ordinary public body')]), { statusCode: 200,
    headers: encoding === undefined ? {} : { 'content-encoding': encoding } })
  fixture.request.mockImplementation((_url, _options, receive: (response: typeof incoming) => void) => Object.assign(new EventEmitter(), {
    end: () => queueMicrotask(() => receive(incoming)),
  }))
  const response = await pinnedFetch('https://federation.example.com/', {})
  expect(await response.text()).toBe('ordinary public body')
})
