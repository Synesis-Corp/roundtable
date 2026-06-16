/** Up to two uppercase initials from a name/email-ish string. Falls back to "U". */
export function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
