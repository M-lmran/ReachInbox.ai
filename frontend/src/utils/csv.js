import Papa from "papaparse";
import { normalizeRecipients } from "@/utils/emailValidator";

const EMAIL_TOKEN = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g;

// Parse a CSV/TXT file in the browser and extract candidate email addresses.
export function parseRecipientFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        const found = [];
        for (const row of results.data) {
          const cells = Array.isArray(row) ? row : Object.values(row || {});
          for (const cell of cells) {
            const text = String(cell ?? "");
            const matches = text.match(EMAIL_TOKEN);
            if (matches) found.push(...matches);
            else if (text.includes("@")) found.push(text);
          }
        }
        const stats = normalizeRecipients(found);
        resolve({ fileName: file.name, ...stats });
      },
      error: (err) => reject(err),
      skipEmptyLines: true,
    });
  });
}
