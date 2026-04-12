const KEY = 'daber_device_id_v1';

function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback
  const rnd = (n = 16) => Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  const b = new Uint8Array(rnd());
  // RFC4122 variant
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0'));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = generateUuidV4();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function setDeviceId(id: string) {
  localStorage.setItem(KEY, id);
}

