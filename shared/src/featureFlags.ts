export function modelIssueAssessmentsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.ENABLE_MODEL_ISSUE_ASSESSMENTS === 'true';
}

export function listingIssueAssessmentsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.ENABLE_LISTING_ISSUE_ASSESSMENTS === 'true';
}
