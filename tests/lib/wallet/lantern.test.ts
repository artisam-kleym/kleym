import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { embeddedMutationAllowed, lanternFrameAllowed, lanternIntentUrl, parseLanternOrigins } from '@/lib/wallet/lantern-config'

const android = 'https://android.golantern.xyz'
const signer = Keypair.random(), sponsor = Keypair.random()
const unsigned = () => new TransactionBuilder(new Account(sponsor.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ source: signer.publicKey(), destination: sponsor.publicKey(), asset: Asset.native(), amount: '1' })).setTimeout(60).build()

describe('Lantern deployment boundaries', () => {
  it('accepts only dedicated Android origin and exact extension IDs', () => {
    expect(parseLanternOrigins(`${android},chrome-extension://${'a'.repeat(32)},${android}`)).toEqual([android,`chrome-extension://${'a'.repeat(32)}`])
    for (const origin of ['https://localhost','http://android.golantern.xyz',android+'/',android+':8443',android+'.evil.com','chrome-extension://*','https://evil.com', 'https://user@android.golantern.xyz']) expect(parseLanternOrigins(origin)).toEqual([])
  })
  it('permits sender and claim frames without permitting administration or APIs', () => {
    for (const path of ['/','/login','/dashboard','/campaigns/new','/campaigns/example','/claim']) expect(lanternFrameAllowed(path)).toBe(true)
    for (const path of ['/admin','/api/campaigns','/campaigns-evil']) expect(lanternFrameAllowed(path)).toBe(false)
  })
  it('keeps private fragments and claim links out of Android intents', () => {
    const link=lanternIntentUrl('https://kleym.example/campaigns/new')
    expect(link).toContain('package=com.lantern.wallet')
    expect(link).toContain('S.browser_fallback_url=https%3A%2F%2Fkleym.example%2Fcampaigns%2Fnew')
    for (const url of ['https://kleym.example/claim#secret','https://kleym.example/#secret','http://kleym.example/','https://user@kleym.example/','https://kleym.example/invite/private-token']) expect(()=>lanternIntentUrl(url)).toThrow()
    expect(lanternIntentUrl('https://kleym.example/login?code=private')).not.toContain('private')
  })
  it('requires Kleym origin for cookie mutations, never the embedding wallet origin', () => {
    const request=(origin?:string,cookie?:string)=>({method:'POST',url:'https://kleym.example/api/campaigns',headers:new Headers({...origin?{origin}:{},...cookie?{cookie}:{}})})
    expect(embeddedMutationAllowed(request('https://kleym.example','session=opaque'),'https://kleym.example')).toBe(true)
    expect(embeddedMutationAllowed(request(android,'session=opaque'),'https://kleym.example')).toBe(false)
    expect(embeddedMutationAllowed(request(undefined,'session=opaque'),'https://kleym.example')).toBe(false)
    expect(embeddedMutationAllowed(request(),'https://kleym.example')).toBe(true)
    expect(embeddedMutationAllowed({...request(),url:'https://kleym.example/api/auth/login'},'https://kleym.example')).toBe(false)
  })
})

describe('Lantern 0.6.2 bridge', () => {
  let surface: EventTarget & { self?: unknown; top?: unknown; parent: {postMessage: ReturnType<typeof vi.fn>}; location: {ancestorOrigins: string[]} }
  const reply=(data:unknown, origin=android, source:unknown=surface.parent)=>{
    const event=new Event('message'); Object.defineProperties(event,{data:{value:data},origin:{value:origin},source:{value:source}});surface.dispatchEvent(event)
  }
  const load=async()=>{const m=await import('@/lib/wallet/lantern');m.configureLantern([android]);return m}
  beforeEach(()=>{
    vi.resetModules();vi.useFakeTimers()
    surface=Object.assign(new EventTarget(),{parent:{postMessage:vi.fn()},location:{ancestorOrigins:[android]}})
    surface.self=surface;surface.top=surface.parent
    vi.stubGlobal('window',surface);vi.stubGlobal('document',{referrer:''})
  })
  afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
  it('validates source and exact origin before accepting an address', async()=>{
    const m=await load();const p=m.connectLantern('testnet');let settled=false;p.then(()=>{settled=true})
    reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()},'https://evil.com')
    reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()},android,{})
    await Promise.resolve();expect(settled).toBe(false)
    reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()});expect(await p).toBe(signer.publicKey())
    expect(surface.parent.postMessage).toHaveBeenCalledWith({type:'lantern:getPublicKey'},android)
  })
  it('refuses wrong-network connections and does not sign', async()=>{
    const m=await load();const p=m.connectLantern('testnet');reply({type:'lantern:publicKey',network:'PUBLIC',publicKey:signer.publicKey()});await expect(p).rejects.toThrow('different account, network')
    expect(surface.parent.postMessage).toHaveBeenCalledTimes(1)
  })
  it('rejects overlap without cancelling the first approval', async()=>{
    const m=await load();const first=m.connectLantern('testnet');await expect(m.connectLantern('testnet')).rejects.toThrow('current Lantern request')
    reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()});expect(await first).toBe(signer.publicKey())
  })
  it('recovers after user rejection', async()=>{
    const m=await load();const first=m.connectLantern('testnet');reply({type:'lantern:connectRejected'});await expect(first).rejects.toThrow('declined')
    const second=m.connectLantern('testnet');reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()});expect(await second).toBe(signer.publicKey())
  })
  it('refuses top-level/unconfigured framing', async()=>{
    const m=await load();surface.top=surface.self;await expect(m.connectLantern('testnet')).rejects.toThrow('inside')
    surface.top=surface.parent;m.configureLantern([]);await expect(m.connectLantern('testnet')).rejects.toThrow('inside')
    expect(surface.parent.postMessage).not.toHaveBeenCalled()
  })
  it('prevents late idless replies from completing a new connection after timeout', async()=>{
    const m=await load();const first=m.connectLantern('testnet');const assertion=expect(first).rejects.toThrow('in time');await vi.advanceTimersByTimeAsync(180_001);await assertion
    await expect(m.connectLantern('testnet')).rejects.toThrow('previous Lantern request timed out')
  })
  it('renews connection then requests exact correlated sign-only XDR', async()=>{
    const m=await load();const tx=unsigned();tx.sign(sponsor);const xdr=tx.toXDR();const signed=TransactionBuilder.fromXDR(xdr,Networks.TESTNET);signed.sign(signer)
    const p=m.signLantern(xdr,'testnet',signer.publicKey());reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()});await Promise.resolve()
    const [message,target]=surface.parent.postMessage.mock.calls.at(-1)!
    expect(message).toMatchObject({type:'lantern:signXdr',xdr,networkPassphrase:Networks.TESTNET});expect(target).toBe(android)
    reply({type:'lantern:xdrSigned',id:'wrong-request',signedXdr:signed.toXDR()})
    reply({type:'lantern:signing',id:message.id});reply({type:'lantern:xdrSigned',id:message.id,signedXdr:signed.toXDR()})
    expect(await p).toBe(signed.toXDR());expect(surface.parent.postMessage.mock.calls.some(([m])=>m.type==='lantern:signAndSubmit')).toBe(false)
  })
  it('rejects changed account before requesting a transaction signature', async()=>{
    const m=await load();const p=m.signLantern(unsigned().toXDR(),'testnet',signer.publicKey());reply({type:'lantern:publicKey',network:'TESTNET',publicKey:sponsor.publicKey()});await expect(p).rejects.toThrow('Select the account');expect(surface.parent.postMessage).toHaveBeenCalledTimes(1)
  })
  it('fails promptly if sign-only is not acknowledged', async()=>{
    const m=await load();const p=m.signLantern(unsigned().toXDR(),'testnet',signer.publicKey());const assertion=expect(p).rejects.toThrow('did not acknowledge');reply({type:'lantern:publicKey',network:'TESTNET',publicKey:signer.publicKey()});await vi.advanceTimersByTimeAsync(5_001);await assertion
  })
  it('refuses body mutation, missing signer and stripped sponsor signature',async()=>{
    const m=await load();const before=unsigned();before.sign(sponsor);const good=TransactionBuilder.fromXDR(before.toXDR(),Networks.TESTNET);good.sign(signer)
    expect(m.verifyLanternSignature(before.toXDR(),good.toXDR(),'testnet',signer.publicKey())).toBe(good.toXDR())
    const stripped=unsigned();stripped.sign(signer)
    for(const signed of [before.toXDR(),stripped.toXDR(),good.toXDR()+'invalid']) expect(()=>m.verifyLanternSignature(before.toXDR(),signed,'testnet',signer.publicKey())).toThrow('preserve')
    const changed=new TransactionBuilder(new Account(sponsor.publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.payment({destination:sponsor.publicKey(),asset:Asset.native(),amount:'2'})).setTimeout(60).build();changed.sign(signer,sponsor)
    expect(()=>m.verifyLanternSignature(before.toXDR(),changed.toXDR(),'testnet',signer.publicKey())).toThrow('preserve')
    expect(()=>m.verifyLanternSignature(before.toXDR(),good.toXDR(),'public',signer.publicKey())).toThrow('preserve')
  })
})
