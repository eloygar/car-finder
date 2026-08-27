import { createHash } from 'node:crypto';

export function normalizeIssueText(issue: string): string {
  return issue.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function issueKey(issue: string): string {
  return createHash('sha256').update(normalizeIssueText(issue), 'utf8').digest('hex');
}
