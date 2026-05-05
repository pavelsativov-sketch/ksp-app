/**
 * 6-character alphanumeric session code, easy to dictate aloud.
 *
 * Excludes ambiguous chars: 0/O/I/1/L/U (also dropped letters that are
 * easily confused when read in Russian like ZH).
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateSessionCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

export function isValidSessionCode(s: string): boolean {
  return /^[A-Z2-9]{6}$/.test(s.toUpperCase());
}
