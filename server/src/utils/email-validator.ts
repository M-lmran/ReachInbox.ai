// Reusable email validation / normalization utility (shared logic with frontend).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NormalizeResult {
  valid: string[];
  duplicatesRemoved: number;
  invalidIgnored: number;
  totalInput: number;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim().toLowerCase());
}

export function normalizeRecipients(input: string[]): NormalizeResult {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalidIgnored = 0;
  let duplicatesRemoved = 0;

  for (const raw of input) {
    const email = (raw ?? '').trim().toLowerCase();
    if (!email) continue;
    if (!isValidEmail(email)) {
      invalidIgnored += 1;
      continue;
    }
    if (seen.has(email)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(email);
    valid.push(email);
  }

  return { valid, duplicatesRemoved, invalidIgnored, totalInput: input.length };
}
