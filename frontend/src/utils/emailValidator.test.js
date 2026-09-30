import { normalizeRecipients, isValidEmail } from "@/utils/emailValidator";

test("isValidEmail validates syntax", () => {
  expect(isValidEmail("a@b.com")).toBe(true);
  expect(isValidEmail("nope")).toBe(false);
});

test("normalizeRecipients dedupes, lowercases and drops invalid", () => {
  const r = normalizeRecipients([
    "RAHUL@gmail.com",
    "rahul@gmail.com",
    "invalid-email",
    "arun@gmail.com",
  ]);
  expect(r.valid).toEqual(["rahul@gmail.com", "arun@gmail.com"]);
  expect(r.duplicatesRemoved).toBe(1);
  expect(r.invalidIgnored).toBe(1);
});
