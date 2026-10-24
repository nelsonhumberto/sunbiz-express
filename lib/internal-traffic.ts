/** Staff and company accounts that should be excluded from product analytics. */
export function isInternalTrafficUser(
  user: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const email = user.email?.trim().toLowerCase() ?? '';
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  return email.slice(at + 1) === 'launchforma.com';
}
