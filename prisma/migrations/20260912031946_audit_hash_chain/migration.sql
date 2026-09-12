-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "canonVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "rowHash" TEXT,
ADD COLUMN     "seq" BIGINT;

-- CreateTable
CREATE TABLE "AuditChainHead" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "rowHash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");


-- The chain head. One row, locked FOR UPDATE by every writer.
INSERT INTO "AuditChainHead" ("id", "seq", "rowHash") VALUES (1, 0, '') ON CONFLICT ("id") DO NOTHING;

-- Append-only at the DATABASE level, whatever role the application connects
-- as: UPDATE and DELETE on audit rows are refused by a trigger, except inside
-- a transaction that has declared itself the retention job with
--   SET LOCAL kleym.audit_maintenance = 'on'
-- which then records what it removed in a chained checkpoint row. This is
-- the control an auditor asks to see; a per-role GRANT would depend on the
-- deployment running the app and the migrations as different roles, which
-- Railway does not.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('kleym.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only: % refused', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
