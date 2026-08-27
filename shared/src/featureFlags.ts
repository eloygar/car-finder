export function modelIssueAssessmentsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.ENABLE_MODEL_ISSUE_ASSESSMENTS === 'true';
}
