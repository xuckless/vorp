// Who speaks what: pure helpers for the language pickers, derived from the session. The owner
// ("you") and the other person ("them") never share a language (owner decision, 21 November
// 2026); the reducer refuses such a setup, and these helpers never offer one.

import { LANGUAGES, type Language } from '@/config/languages';
import { sameLanguage, theirLanguage, validPeople, type People, type Role, type Session } from '@/core/session';

const otherRole = (role: Role): Role => (role === 'owner' ? 'other' : 'owner');

/** The languages a role may pick: every language except the other role's (and its variants, see `sameLanguage`). */
export function pickableLanguages(people: People, role: Role): Language[] {
  const taken = people[otherRole(role)].language;
  return LANGUAGES.filter((l) => !sameLanguage(l.code, taken));
}

/** The setup with a role's language changed, or undefined when that would give both the same language. */
export function withLanguage(people: People, role: Role, language: string): People | undefined {
  const next: People = { ...people, [role]: { ...people[role], language } };
  return validPeople(next) ? next : undefined;
}

/**
 * The language to show for a role. The owner's is their pick. Theirs is the language they last
 * spoke while a conversation runs (with auto-detect), and the pick again once it has stopped:
 * the detected language is forgotten when the conversation ends.
 */
export function shownLanguage(s: Session, role: Role): string {
  return role === 'owner' ? s.people.owner.language : theirLanguage(s);
}
