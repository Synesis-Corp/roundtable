/**
 * File-type whitelist for chat attachments. The composer accepts only images
 * and PDFs for now (see RISKS.md / product roadmap for future expansion). The
 * `accept` attribute on the `<input type="file">` is advisory — the user can
 * still pick "All files" in the OS picker — so this module is the single
 * source of truth used by BOTH the file picker path and the drag-and-drop
 * path to filter what actually gets attached.
 *
 * The list is intentionally exported so the input element's `accept`
 * attribute can be derived from it and stay in sync.
 */

export const ALLOWED_MIME_PREFIXES = ["image/*", "application/pdf"] as const;

/** Returns true if the file's mime type is allowed for chat attachment. */
export function isAllowedFile(file: File): boolean {
  const type = file.type;
  if (!type) return false;
  return ALLOWED_MIME_PREFIXES.some((allowed) => {
    if (allowed.endsWith("/*")) {
      // Wildcard: "image/*" matches "image/jpeg", "image/png", etc.
      const prefix = allowed.slice(0, -1); // "image/"
      return type.startsWith(prefix);
    }
    return type === allowed;
  });
}

export interface FileFilterResult {
  allowed: File[];
  rejected: File[];
}

/** Splits a list of files into allowed and rejected buckets. Order preserved. */
export function filterAllowedFiles(files: File[]): FileFilterResult {
  const allowed: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    if (isAllowedFile(file)) allowed.push(file);
    else rejected.push(file);
  }
  return { allowed, rejected };
}
