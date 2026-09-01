const DATABASE_VERSION = 1;
const VALUE_STORE = "values";
const META_STORE = "meta";
const CRYPTO_KEY_ID = "device-key";
const MIGRATION_ID = "legacy-local-storage-v1";

type EncryptedValue = {
  key: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

async function accountHash(accountId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accountId));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function openDatabase(accountId: string): Promise<IDBDatabase> {
  const hash = await accountHash(accountId);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`form-local-${hash}`, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(VALUE_STORE)) database.createObjectStore(VALUE_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to open local database")), { once: true });
  });
}

async function loadOrCreateCryptoKey(database: IDBDatabase): Promise<CryptoKey> {
  const read = database.transaction(META_STORE, "readonly");
  const existing = await requestResult(read.objectStore(META_STORE).get(CRYPTO_KEY_ID) as IDBRequest<CryptoKey | undefined>);
  await transactionDone(read);
  if (existing) return existing;
  const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const write = database.transaction(META_STORE, "readwrite");
  write.objectStore(META_STORE).put(generated, CRYPTO_KEY_ID);
  await transactionDone(write);
  return generated;
}

async function encryptValue(key: CryptoKey, storageKey: string, value: string): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(storageKey) },
    key,
    new TextEncoder().encode(value),
  );
  return {
    key: storageKey,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  };
}

async function decryptValue(key: CryptoKey, value: EncryptedValue): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(value.iv),
      additionalData: new TextEncoder().encode(value.key),
    },
    key,
    base64ToBytes(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export const LEGACY_STORAGE_KEYS = [
  "squat-lab:sessions:v1",
  "move-local:settings:v1",
  "form:body-profile:v1",
  "form:body-snapshots:v1",
  "form:capacity-records:v1",
  "form:custom-workout-plans:v1",
  "form:custom-plan-draft:v1",
  "form:coach-threads:v1",
  "form:calorie-equivalent:v1",
] as const;

/**
 * Synchronous Storage-compatible view backed by an encrypted, account-specific IndexedDB.
 * Call createAccountStorage before importing the application so reads are hydrated first.
 */
export class AccountStorage implements Storage {
  private readonly values = new Map<string, string>();
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    readonly accountId: string,
    private readonly database: IDBDatabase,
    private readonly cryptoKey: CryptoKey,
  ) {}

  static async create(accountId: string, legacyStorage: Storage | null = window.localStorage): Promise<AccountStorage> {
    const database = await openDatabase(accountId);
    const cryptoKey = await loadOrCreateCryptoKey(database);
    const storage = new AccountStorage(accountId, database, cryptoKey);
    await storage.hydrate();
    await storage.migrateLegacyOnce(legacyStorage);
    return storage;
  }

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
    this.enqueue(async () => {
      const transaction = this.database.transaction(VALUE_STORE, "readwrite");
      transaction.objectStore(VALUE_STORE).clear();
      await transactionDone(transaction);
    });
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.enqueue(async () => {
      const transaction = this.database.transaction(VALUE_STORE, "readwrite");
      transaction.objectStore(VALUE_STORE).delete(key);
      await transactionDone(transaction);
    });
  }

  setItem(key: string, value: string): void {
    const serialized = String(value);
    this.values.set(key, serialized);
    this.enqueue(async () => {
      const encrypted = await encryptValue(this.cryptoKey, key, serialized);
      const transaction = this.database.transaction(VALUE_STORE, "readwrite");
      transaction.objectStore(VALUE_STORE).put(encrypted);
      await transactionDone(transaction);
    });
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  close(): void {
    this.database.close();
    this.values.clear();
  }

  exportPlainObject(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }

  async importPlainObject(data: Record<string, string>, mode: "merge" | "replace" = "merge"): Promise<void> {
    if (mode === "replace") this.clear();
    for (const [key, value] of Object.entries(data)) this.setItem(key, value);
    await this.flush();
  }

  private enqueue(task: () => Promise<void>): void {
    this.pendingWrite = this.pendingWrite.then(task).catch((error: unknown) => {
      window.dispatchEvent(new CustomEvent("form:local-storage-error", { detail: error }));
    });
  }

  private async hydrate(): Promise<void> {
    const transaction = this.database.transaction(VALUE_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(VALUE_STORE).getAll() as IDBRequest<EncryptedValue[]>);
    await transactionDone(transaction);
    for (const record of records) {
      try {
        this.values.set(record.key, await decryptValue(this.cryptoKey, record));
      } catch {
        // A corrupt record is isolated instead of preventing the account from opening.
      }
    }
  }

  private async migrateLegacyOnce(legacyStorage: Storage | null): Promise<void> {
    const transaction = this.database.transaction(META_STORE, "readonly");
    const migrated = await requestResult(transaction.objectStore(META_STORE).get(MIGRATION_ID) as IDBRequest<boolean | undefined>);
    await transactionDone(transaction);
    if (migrated) return;
    const claimedLegacyKeys: string[] = [];
    if (legacyStorage) {
      for (const key of LEGACY_STORAGE_KEYS) {
        const value = legacyStorage.getItem(key);
        if (value !== null && !this.values.has(key)) {
          this.setItem(key, value);
          claimedLegacyKeys.push(key);
        }
      }
    }
    await this.flush();
    // Legacy values were not account-scoped. Remove them after the first successful
    // claim so a second invited account cannot inherit the first user's old data.
    for (const key of claimedLegacyKeys) legacyStorage?.removeItem(key);
    const write = this.database.transaction(META_STORE, "readwrite");
    write.objectStore(META_STORE).put(true, MIGRATION_ID);
    await transactionDone(write);
  }
}

let currentStorage: AccountStorage | null = null;

export function setCurrentAccountStorage(storage: AccountStorage): void {
  currentStorage?.close();
  currentStorage = storage;
}

export function getCurrentAccountStorage(): AccountStorage {
  if (!currentStorage) throw new Error("Account storage has not been initialized");
  return currentStorage;
}
