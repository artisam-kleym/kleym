/**
 * The hash chain under the audit log. Issue #49.
 *
 * Every row `recordAudit` writes takes the next `seq`, `prevHash` = the
 * previous row's `rowHash`, and `rowHash = SHA-256(prevHash ‖ canonical(row))`.
 * Modify, insert or delete a row and the chain no longer recomputes from
 * that point; `verifyChain` says where.
 *
 * CANONICAL FORM IS EXPLICIT AND VERSIONED. A JSON serialisation whose key
 * order can drift between library versions would make every historical row
 * unverifiable on upgrade — so v1 is a fixed field order with explicit
 * escaping, metadata keys sorted recursively, and `canonVersion` on the row
 * names which form to recompute with. Add v2; never change v1.
 *
 * WRITES SERIALISE on the single `AuditChainHead` row, locked FOR UPDATE
 * inside the same transaction as the insert. Two concurrent writers queue on
 * the lock rather than both reading the same predecessor and forking.
 *
 * RETENTION IS VISIBLE. Removing old rows would break the chain, so the
 * retention job records a checkpoint row — itself chained — naming how many
 * rows it removed, which seqs, and the hash of the last one. A verifier
 * that meets a row whose predecessor is missing accepts it only if that
 * row is a checkpoint whose `prevHash` equals the hash it says it removed.
 */
import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'

export const CANON_VERSION = 1
export const CHECKPOINT_ACTION = 'audit.checkpoint'

export interface ChainRow {
  id: string
  seq: bigint | null
  prevHash: string | null
  rowHash: string | null
  canonVersion: number
  userId: string | null
  organizationId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: unknown
  ip: string | null
  createdAt: Date
}

/** Sorted-key JSON, recursively, so the same object always canonicalises alike. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
}

/** v1: fixed field order, each field JSON-escaped, joined by `|`. */
export function canonicalRowV1(row: Omit<ChainRow, 'prevHash' | 'rowHash' | 'canonVersion'>): string {
  return [
    'v1',
    String(row.seq ?? ''),
    row.id,
    row.createdAt.toISOString(),
    JSON.stringify(row.userId),
    JSON.stringify(row.organizationId),
    JSON.stringify(row.action),
    JSON.stringify(row.entityType),
    JSON.stringify(row.entityId),
    JSON.stringify(row.ip),
    canonicalJson(row.metadata ?? null),
  ].join('|')
}

export function rowHashFor(prevHash: string, canonical: string): string {
  return createHash('sha256').update(prevHash).update('|').update(canonical).digest('hex')
}

export interface AppendInput {
  id: string
  /** Fixtures only: a row's time is normally the write's. Hashed either way. */
  createdAt?: Date
  userId: string | null
  organizationId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull
  ip: string | null
}

/**
 * Appends one row to the chain. The head row is locked FOR UPDATE for the
 * length of the transaction, so the seq and prevHash read here are the ones
 * this row is written against — no other writer can slip between.
 */
export async function appendChained(input: AppendInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [head] = await tx.$queryRaw<{ seq: bigint; rowHash: string }[]>(
      Prisma.sql`SELECT "seq", "rowHash" FROM "AuditChainHead" WHERE "id" = 1 FOR UPDATE`,
    )
    if (!head) throw new Error('audit chain head row is missing; run migrations')
    const seq = head.seq + 1n
    const createdAt = input.createdAt ?? new Date()
    const metadata = input.metadata === Prisma.JsonNull ? null : input.metadata
    const canonical = canonicalRowV1({
      id: input.id, seq, createdAt, userId: input.userId, organizationId: input.organizationId,
      action: input.action, entityType: input.entityType, entityId: input.entityId, metadata, ip: input.ip,
    })
    const rowHash = rowHashFor(head.rowHash, canonical)
    await tx.auditLog.create({
      data: {
        id: input.id, seq, prevHash: head.rowHash, rowHash, canonVersion: CANON_VERSION, createdAt,
        userId: input.userId, organizationId: input.organizationId, action: input.action,
        entityType: input.entityType, entityId: input.entityId, metadata: input.metadata, ip: input.ip,
      },
    })
    await tx.auditChainHead.update({ where: { id: 1 }, data: { seq, rowHash } })
  })
}

export interface VerifyResult {
  ok: boolean
  /** Rows on the chain, in seq order. */
  chained: number
  /** Rows with no seq: written outside recordAudit. Any is a failure. */
  unchained: number
  checkpoints: number
  firstSeq: bigint | null
  lastSeq: bigint | null
  lastHash: string | null
  /** The first place the chain does not recompute, and why. */
  broken: { seq: bigint; reason: string } | null
}

const PAGE = 1_000

/**
 * Walks the whole chain in seq order and recomputes every hash. Reports the
 * first link that fails: a row whose stored hash is not what its contents
 * and predecessor produce (modification), a gap in seq that is not covered
 * by a checkpoint (deletion), a row with no seq (insertion), or a head that
 * does not match the last row.
 */
export async function verifyChain(): Promise<VerifyResult> {
  const result: VerifyResult = { ok: true, chained: 0, unchained: 0, checkpoints: 0, firstSeq: null, lastSeq: null, lastHash: null, broken: null }
  result.unchained = await prisma.auditLog.count({ where: { seq: null } })
  if (result.unchained > 0) result.broken = { seq: 0n, reason: `${result.unchained} row(s) have no chain position: written outside recordAudit` }

  /*
   * Checkpoints are appended at the TAIL when retention runs, so the row
   * whose predecessor they removed is earlier in the chain than they are.
   * Index them first: a row with a missing predecessor is acceptable only
   * if a checkpoint says it removed exactly up to that predecessor and
   * names the predecessor's hash.
   */
  const checkpoints = await prisma.auditLog.findMany({ where: { action: CHECKPOINT_ACTION, seq: { not: null } }, select: { metadata: true } })
  const covered = new Map<string, string>() // toSeq → lastHash
  for (const cp of checkpoints) {
    const m = cp.metadata as { toSeq?: string; lastHash?: string } | null
    if (m?.toSeq && m.lastHash) covered.set(m.toSeq, m.lastHash)
  }
  const accountedFor = (missingSeq: bigint, prevHash: string | null): boolean => covered.get(String(missingSeq)) === (prevHash ?? '')

  let prevHash = ''
  let expectedSeq: bigint | null = null
  let after: bigint | null = null
  for (;;) {
    const rows: ChainRow[] = await prisma.auditLog.findMany({
      where: { seq: after === null ? { not: null } : { gt: after } },
      orderBy: { seq: 'asc' },
      take: PAGE,
    })
    if (rows.length === 0) break
    for (const row of rows) {
      const seq = row.seq!
      if (result.firstSeq === null) result.firstSeq = seq
      result.chained += 1
      if (row.action === CHECKPOINT_ACTION) result.checkpoints += 1

      if (result.broken === null) {
        if (expectedSeq === null) {
          // The first row present. Genesis has an empty prevHash; anything
          // else must be the successor of a retention checkpoint's last removed row.
          if (row.prevHash && row.prevHash !== '') {
            if (accountedFor(seq - 1n, row.prevHash)) prevHash = row.prevHash
            else result.broken = { seq, reason: 'first row is not the genesis and no checkpoint accounts for its predecessor' }
          }
        } else if (seq !== expectedSeq) {
          result.broken = { seq, reason: `expected seq ${expectedSeq}, found ${seq}: rows removed without a checkpoint` }
        }
        if (result.broken === null) {
          if ((row.prevHash ?? '') !== prevHash) {
            result.broken = { seq, reason: 'prevHash does not match the previous row' }
          } else if (row.canonVersion !== CANON_VERSION) {
            result.broken = { seq, reason: `unknown canonical form v${row.canonVersion}` }
          } else {
            const recomputed = rowHashFor(prevHash, canonicalRowV1(row))
            if (recomputed !== row.rowHash) result.broken = { seq, reason: 'rowHash does not recompute: contents changed' }
          }
        }
      }
      prevHash = row.rowHash ?? ''
      expectedSeq = seq + 1n
      result.lastSeq = seq
      result.lastHash = row.rowHash
      after = seq
    }
    if (rows.length < PAGE) break
  }

  if (result.broken === null) {
    const head = await prisma.auditChainHead.findUnique({ where: { id: 1 } })
    if (head && result.lastSeq !== null && (head.seq !== result.lastSeq || head.rowHash !== result.lastHash)) {
      result.broken = { seq: result.lastSeq, reason: 'the chain head does not match the last row: rows appended or removed at the tail' }
    }
  }
  result.ok = result.broken === null
  return result
}

/**
 * Retention. Rows older than the cutoff are removed inside one transaction
 * that (a) declares itself the maintenance job so the append-only trigger
 * lets the DELETE through, and (b) appends a chained checkpoint recording
 * exactly what it removed. Deletion is therefore itself audited, and the
 * chain still verifies across the gap.
 */
export const AUDIT_RETENTION_DAYS = 730

export async function retainAudit(now: Date = new Date(), retentionDays = AUDIT_RETENTION_DAYS): Promise<{ removed: number; fromSeq: bigint | null; toSeq: bigint | null }> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000)
  return prisma.$transaction(async (tx) => {
    const [head] = await tx.$queryRaw<{ seq: bigint; rowHash: string }[]>(
      Prisma.sql`SELECT "seq", "rowHash" FROM "AuditChainHead" WHERE "id" = 1 FOR UPDATE`,
    )
    if (!head) throw new Error('audit chain head row is missing')
    // Only a contiguous PREFIX of the chain may go, and never the previous
    // checkpoint's successor without the checkpoint itself: take everything
    // older than the cutoff from the lowest seq up to the first row that is
    // not older.
    const firstKept = await tx.auditLog.findFirst({ where: { seq: { not: null }, createdAt: { gt: cutoff } }, orderBy: { seq: 'asc' }, select: { seq: true } })
    const oldest = await tx.auditLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: 'asc' }, select: { seq: true } })
    if (!oldest?.seq) return { removed: 0, fromSeq: null, toSeq: null }
    const toSeq = firstKept?.seq ? firstKept.seq - 1n : head.seq
    if (toSeq < oldest.seq) return { removed: 0, fromSeq: null, toSeq: null }
    const last = await tx.auditLog.findUniqueOrThrow({ where: { seq: toSeq }, select: { rowHash: true } })

    await tx.$executeRaw(Prisma.sql`SET LOCAL kleym.audit_maintenance = 'on'`)
    const { count } = await tx.auditLog.deleteMany({ where: { seq: { gte: oldest.seq, lte: toSeq } } })

    // The checkpoint, chained onto the current head.
    const seq = head.seq + 1n
    const createdAt = now
    const id = `cp_${seq}`
    const metadata = { removed: count, fromSeq: String(oldest.seq), toSeq: String(toSeq), lastHash: last.rowHash, retentionDays }
    const canonical = canonicalRowV1({ id, seq, createdAt, userId: null, organizationId: null, action: CHECKPOINT_ACTION, entityType: 'audit', entityId: null, metadata, ip: null })
    const rowHash = rowHashFor(head.rowHash, canonical)
    await tx.auditLog.create({
      data: { id, seq, prevHash: head.rowHash, rowHash, canonVersion: CANON_VERSION, createdAt, action: CHECKPOINT_ACTION, entityType: 'audit', metadata },
    })
    await tx.auditChainHead.update({ where: { id: 1 }, data: { seq, rowHash } })
    logger.info({ removed: count, fromSeq: String(oldest.seq), toSeq: String(toSeq) }, 'audit retention checkpoint written')
    return { removed: count, fromSeq: oldest.seq, toSeq }
  })
}

/* ── Signed export ─────────────────────────────────────────────────────── */

function signingKey() {
  const seed = Buffer.from(env.AUDIT_SIGNING_SEED, 'base64')
  // PKCS#8 wrapper for an Ed25519 private key: fixed 16-byte prefix + 32-byte seed.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed])
  return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
}

/** The public key, as base64 SPKI DER — what a verifier needs and all they need. */
export function signingPublicKey(): string {
  return createPublicKey(signingKey()).export({ format: 'der', type: 'spki' }).toString('base64')
}

export function signBytes(bytes: Buffer): string {
  return edSign(null, bytes, signingKey()).toString('base64')
}

export function verifyBytes(bytes: Buffer, signature: string, publicKeyBase64: string): boolean {
  const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' })
  return edVerify(null, bytes, key, Buffer.from(signature, 'base64'))
}

export interface ExportQuery {
  organizationId: string
  from?: Date
  to?: Date
}

const EXPORT_COLUMNS = ['seq', 'id', 'createdAt', 'userId', 'organizationId', 'action', 'entityType', 'entityId', 'ip', 'metadata', 'prevHash', 'rowHash', 'canonVersion'] as const

export function exportRows(query: ExportQuery): Promise<ChainRow[]> {
  return prisma.auditLog.findMany({
    where: {
      organizationId: query.organizationId,
      seq: { not: null },
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    },
    orderBy: { seq: 'asc' },
  })
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? canonicalJson(value) : value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Builds the export body and its detached signature over EXACTLY those bytes.
 * A verifier recomputes the hash of the bytes they were given and checks the
 * signature with the public key alone — no Kleym involved.
 */
export function buildExport(rows: ChainRow[], query: ExportQuery, format: 'csv' | 'json'): { body: Buffer; contentType: string; signature: string; publicKey: string } {
  const plain = rows.map((r) => ({
    seq: String(r.seq), id: r.id, createdAt: r.createdAt.toISOString(), userId: r.userId, organizationId: r.organizationId,
    action: r.action, entityType: r.entityType, entityId: r.entityId, ip: r.ip, metadata: r.metadata ?? null,
    prevHash: r.prevHash, rowHash: r.rowHash, canonVersion: r.canonVersion,
  }))
  let body: Buffer
  let contentType: string
  if (format === 'json') {
    body = Buffer.from(canonicalJson({
      format: 'kleym-audit-export', version: 1, organizationId: query.organizationId,
      from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null,
      count: plain.length, firstSeq: plain[0]?.seq ?? null, lastSeq: plain.at(-1)?.seq ?? null, rows: plain,
    }))
    contentType = 'application/json'
  } else {
    const lines = [EXPORT_COLUMNS.join(',')]
    for (const r of plain) lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(','))
    body = Buffer.from(lines.join('\n') + '\n')
    contentType = 'text/csv; charset=utf-8'
  }
  return { body, contentType, signature: signBytes(body), publicKey: signingPublicKey() }
}

/* ── One-time backfill of rows older than the chain ────────────────────── */

export interface BackfillResult {
  chained: number
  lastSeq: bigint
}

/**
 * Chains every row that predates the chain, once, in `(createdAt, id)`
 * order, and moves the head to the last of them. Refuses to run if the head
 * has already moved past genesis: legacy rows can only take seqs 1…n, and
 * once a live write has taken seq 1 there is no honest place to put them.
 * Runs inside the maintenance flag, since the trigger otherwise refuses the
 * UPDATE. Never tolerated by the verifier instead — a backdated forgery
 * would slip through the exact check that exists to catch insertion.
 */
export async function backfillLegacyRows(): Promise<BackfillResult> {
  return prisma.$transaction(async (tx) => {
    const [head] = await tx.$queryRaw<{ seq: bigint; rowHash: string }[]>(
      Prisma.sql`SELECT "seq", "rowHash" FROM "AuditChainHead" WHERE "id" = 1 FOR UPDATE`,
    )
    if (!head) throw new Error('audit chain head row is missing; run migrations')
    if (head.seq !== 0n) {
      throw new Error(`the chain head is already at seq ${head.seq}; the backfill must run before the first chained write`)
    }
    await tx.$executeRaw(Prisma.sql`SET LOCAL kleym.audit_maintenance = 'on'`)

    let seq = 0n
    let prevHash = ''
    let after: { createdAt: Date; id: string } | null = null
    for (;;) {
      const rows: ChainRow[] = await tx.auditLog.findMany({
        where: {
          seq: null,
          ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PAGE,
      })
      if (rows.length === 0) break
      for (const row of rows) {
        seq += 1n
        const rowHash = rowHashFor(prevHash, canonicalRowV1({ ...row, seq }))
        await tx.auditLog.update({ where: { id: row.id }, data: { seq, prevHash, rowHash, canonVersion: CANON_VERSION } })
        prevHash = rowHash
        after = { createdAt: row.createdAt, id: row.id }
      }
      if (rows.length < PAGE) break
    }
    if (seq > 0n) await tx.auditChainHead.update({ where: { id: 1 }, data: { seq, rowHash: prevHash } })
    logger.info({ chained: Number(seq) }, 'legacy audit rows chained')
    return { chained: Number(seq), lastSeq: seq }
  }, { timeout: 10 * 60_000 })
}
