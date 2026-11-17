/**
 * Cofre: arquivo trancado com senha (docs/design.md, "Arquivo trancado").
 * A chave sai da senha por PBKDF2-SHA256 com muitas repetições (cada tentativa de adivinhar fica lenta)
 * e o conteúdo é cifrado com AES-256-GCM (qualquer alteração no arquivo é detectada).
 * Usa só a criptografia embutida no navegador (Web Crypto).
 */

const FORMAT = 'box-flow-vault'

/** Mínimo de caracteres da senha (decisão de 17/11/2026: o usuário escolhe, com mínimo). */
export const MIN_PASSWORD_LENGTH = 16

/**
 * `wrong-password`: senha errada ou arquivo alterado (o AES-GCM não distingue os dois casos).
 * `weak-password`: senha curta demais para trancar. `not-a-vault`: o arquivo não é um cofre do box-flow.
 */
export class VaultError extends Error {
  override name = 'VaultError'

  constructor(readonly reason: 'wrong-password' | 'weak-password' | 'not-a-vault') {
    super(reason)
  }
}
const DEFAULT_ITERATIONS = 600_000

interface VaultFile {
  format: typeof FORMAT
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  data: string
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Tranca `payload` com a senha. O resultado é o texto do arquivo. */
export async function lockVault(payload: unknown, password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  if ([...password.normalize('NFC')].length < MIN_PASSWORD_LENGTH) throw new VaultError('weak-password')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iterations)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
  const file: VaultFile = {
    format: FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  }
  return JSON.stringify(file, null, 1)
}

/** Destranca o arquivo com a senha e devolve o conteúdo. */
export async function unlockVault(fileText: string, password: string): Promise<unknown> {
  const file = parseVaultFile(fileText)
  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations)
  let data: ArrayBuffer
  try {
    data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(file.cipher.iv) }, key, fromBase64(file.data))
  } catch {
    throw new VaultError('wrong-password')
  }
  return JSON.parse(new TextDecoder().decode(data))
}

/** `true` se o texto parece um cofre do box-flow (para decidir se pede a senha). */
export function isVault(fileText: string): boolean {
  try {
    parseVaultFile(fileText)
    return true
  } catch {
    return false
  }
}

function parseVaultFile(fileText: string): VaultFile {
  let file: Partial<VaultFile>
  try {
    file = JSON.parse(fileText) as Partial<VaultFile>
  } catch {
    throw new VaultError('not-a-vault')
  }
  if (file?.format !== FORMAT || !file.kdf?.salt || !file.cipher?.iv || typeof file.data !== 'string') {
    throw new VaultError('not-a-vault')
  }
  return file as VaultFile
}

/** Bytes → base64, em pedaços (o backup com lançamentos pode ter centenas de KB). */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
