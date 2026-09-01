const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createEncryptedBackup(data: Record<string, string>, password: string): Promise<Blob> {
  if (password.length < 8) throw new Error("备份密码至少需要 8 位");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const payload = encoder.encode(JSON.stringify({ format: "form-backup", version: 1, exportedAt: new Date().toISOString(), data }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return new Blob([JSON.stringify({ format: "form-backup-encrypted", version: 1, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) })], { type: "application/json" });
}

export async function readEncryptedBackup(file: File, password: string): Promise<Record<string, string>> {
  const envelope = JSON.parse(await file.text()) as { format?: unknown; salt?: unknown; iv?: unknown; ciphertext?: unknown };
  if (envelope.format !== "form-backup-encrypted" || typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") throw new Error("不是有效的 FORM 备份文件");
  const key = await deriveKey(password, fromBase64(envelope.salt));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
  const payload = JSON.parse(decoder.decode(plaintext)) as { format?: unknown; data?: unknown };
  if (payload.format !== "form-backup" || !payload.data || typeof payload.data !== "object") throw new Error("备份内容不完整");
  return Object.fromEntries(Object.entries(payload.data).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

