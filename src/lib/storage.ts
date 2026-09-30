import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Object-storage adapter for the Document Hub (KNOWN_LIMITATIONS #1).
 *
 * Decision (ADR-014): local disk is the default backend — zero dependencies,
 * no egress cost, fits the minimal single-node deployment. The interface is
 * the seam: an S3-compatible implementation can be added without touching
 * product code (same pattern as the AI provider adapter).
 *
 * Security properties (SECURITY.md §Uploads):
 * - Keys are random 128-bit ids; client filenames are metadata only, never
 *   used to build paths (no path traversal via `../` filenames).
 * - Keys are constructed from an org id passed in by the tenancy-verified
 *   caller — cross-tenant key construction is not expressible.
 * - The raw byte stream never touches the database.
 * - Delete is best-effort here; the caller records the outcome in audit.
 */

export interface StoredObject {
  key: string;
  sizeBytes: number;
  sha256: string;
}

export interface StorageAdapter {
  /** Store bytes under a key namespaced by the caller's verified org. */
  put(orgId: string, data: Buffer): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  stat(key: string): Promise<{ sizeBytes: number } | null>;
}

function dataRoot(): string {
  // Hardened in production via systemd ReadWritePaths (see infra unit file).
  return process.env.DOCUMENT_STORAGE_DIR ?? "/var/lib/bizmemory/documents";
}

/**
 * Org-scoped two-level fan-out + random 128-bit id:
 * - org prefix makes bulk ops (export/delete per tenant) trivial and auditable
 * - fan-out avoids directory-size blowup on ext4
 * - nothing user-supplied ever lands in a path.
 */
function buildKey(orgId: string): string {
  const id = randomBytes(16).toString("hex");
  return `${orgId}/${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

// org ids are cuids (25 chars, lowercase+digits, starts with c); keys are
// exactly what buildKey produces and nothing else (defense in depth against
// a future caller passing user input into get()/delete()).
const KEY_RE = /^[a-z0-9]{20,40}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{32}$/;

function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
}

const disk: StorageAdapter = {
  async put(orgId, data) {
    if (!/^[a-z0-9]{20,40}$/.test(orgId)) {
      throw new Error("Invalid org id for storage put");
    }
    const key = buildKey(orgId);
    const abs = path.join(dataRoot(), key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data, { mode: 0o640 });
    return {
      key,
      sizeBytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  },

  async get(key) {
    assertSafeKey(key);
    return readFile(path.join(dataRoot(), key));
  },

  async delete(key) {
    assertSafeKey(key);
    try {
      await unlink(path.join(dataRoot(), key));
    } catch {
      // Already gone is fine; audit records what happened.
    }
  },

  async stat(key) {
    assertSafeKey(key);
    try {
      const s = await stat(path.join(dataRoot(), key));
      return { sizeBytes: s.size };
    } catch {
      return null;
    }
  },
};

export const storage: StorageAdapter = disk;
