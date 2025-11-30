import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'ideaspark_device_id';

const isValidUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function getDeviceId(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';

  try {
    const storage = window.localStorage;
    const existing = storage.getItem(STORAGE_KEY);
    if (existing && isValidUuid(existing)) return existing;

    const fresh = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    storage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch (error) {
    console.warn('Failed to access deviceId storage', error);
    return '';
  }
}

const fingerprintPromise: Promise<string> | null =
  typeof window !== 'undefined'
    ? FingerprintJS.load()
        .then(async (fp) => {
          try {
            const result = await fp.get();
            return result.visitorId || '';
          } catch (error) {
            console.warn('Failed to get fingerprint', error);
            return '';
          }
        })
        .catch((error) => {
          console.warn('Failed to load fingerprint', error);
          return '';
        })
    : null;

const sha256 = async (input: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export async function getUniqueDeviceId(): Promise<string> {
  const baseId = getDeviceId();
  if (!baseId) return '';

  try {
    const fingerprintId = fingerprintPromise ? await fingerprintPromise : '';
    const combined = `${baseId}|${fingerprintId}`;
    const hash = await sha256(combined);
    return hash || baseId;
  } catch (error) {
    console.warn('Failed to generate unique device id', error);
    return baseId;
  }
}
