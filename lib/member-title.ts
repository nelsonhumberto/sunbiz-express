/** i18n keys under `wizard.*` for member/officer title codes. */
const TITLE_MESSAGE_KEYS: Record<string, string> = {
  AMBR: 'titleAuthorizedMember',
  MGRM: 'titleManagingMember',
  AP: 'titleAuthorizedPerson',
  MGR: 'titleManager',
  OFFICER: 'titleOfficer',
  DIRECTOR: 'titleDirector',
  PRESIDENT: 'titlePresident',
  TREASURER: 'titleTreasurer',
  SECRETARY: 'titleSecretary',
};

export function memberTitleMessageKey(title: string | null | undefined): string | null {
  if (!title) return null;
  return TITLE_MESSAGE_KEYS[title] ?? null;
}

/** Display label kept separate from the person's name (never "AMBRQa Tester"). */
export function memberTitleLabel(
  title: string | null | undefined,
  translate: (key: string) => string,
): string {
  const key = memberTitleMessageKey(title);
  if (key) return translate(key);
  return title?.trim() || '';
}

/** Title and name with a space between them. Never "AMBRE2E TestOct24". */
export function reviewMemberText(name: string, titleLabel: string): string {
  const person = name.trim();
  const title = titleLabel.trim();
  if (title && person) return `${title} ${person}`;
  return person || title;
}
