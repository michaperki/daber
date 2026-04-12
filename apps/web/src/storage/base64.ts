export function u8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const len = u8.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(u8[i]);
  // btoa is available in browsers; Node 20+ has Buffer API as fallback
  if (typeof btoa !== 'undefined') return btoa(binary);
  // @ts-ignore
  return Buffer.from(binary, 'binary').toString('base64');
}

export function base64ToU8(base64: string): Uint8Array {
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // @ts-ignore
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

