// Email validation / normalization — mirrors backend util for consistent client counts.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_REGEX.test(String(value || "").trim().toLowerCase());
}

export function normalizeRecipients(input) {
  const seen = new Set();
  const valid = [];
  let invalidIgnored = 0;
  let duplicatesRemoved = 0;

  for (const raw of input) {
    const email = String(raw ?? "").trim().toLowerCase();
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

  return {
    valid,
    duplicatesRemoved,
    invalidIgnored,
    totalInput: input.length,
  };
}
