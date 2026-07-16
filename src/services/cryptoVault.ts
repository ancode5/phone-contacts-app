import type { EncryptedDatabaseEnvelope } from '../types';

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const sourceKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    sourceKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(value: unknown, password: string): Promise<string> {
  if (password.length < 10) {
    throw new Error('Пароль шифрования должен содержать не менее 10 символов.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  );

  const envelope: EncryptedDatabaseEnvelope = {
    format: 'contacts-aes-gcm',
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };

  return JSON.stringify(envelope);
}

export async function decryptJson<T>(encryptedText: string, password: string): Promise<T> {
  let envelope: EncryptedDatabaseEnvelope;

  try {
    envelope = JSON.parse(encryptedText) as EncryptedDatabaseEnvelope;
  } catch {
    throw new Error('Облачный файл имеет повреждённый формат.');
  }

  if (envelope.format !== 'contacts-aes-gcm' || envelope.version !== 1) {
    throw new Error('Формат зашифрованной базы не поддерживается этой версией приложения.');
  }

  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const key = await deriveKey(password, salt, envelope.kdf.iterations);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );

    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    throw new Error('Не удалось расшифровать базу. Проверьте пароль справочника.');
  }
}
