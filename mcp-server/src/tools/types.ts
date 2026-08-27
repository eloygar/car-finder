export interface VehicleQuery {
  brand: string;
  model: string;
  year?: number;
}

export type VehicleOperabilityStatus = 'operational' | 'non_operational' | 'unknown';
export type VehicleOperabilityConfidence = 'low' | 'medium' | 'high';

export interface VehicleOperabilitySubmission {
  description: string;
  status: VehicleOperabilityStatus;
  confidence: VehicleOperabilityConfidence;
  evidence: string[];
  reason: string;
}

export type VehicleOperabilityResult = Omit<VehicleOperabilitySubmission, 'description'>;

export interface AnthropicToolUsage {
  inputTokens: number;
  outputTokens: number;
  webSearchRequests: number;
}

export interface OperationalStatusToolResult {
  operability: VehicleOperabilityResult;
  model: string;
  usage: AnthropicToolUsage;
}

export interface KnownIssuesWebSource {
  title: string;
  url: string;
}

export interface KnownIssuesWebAnalysis {
  mechanical: string[];
  bodywork: string[];
  interior: string[];
  other: string[];
  sources: KnownIssuesWebSource[];
}

export interface KnownIssuesWebToolResult {
  knownIssues: KnownIssuesWebAnalysis;
  model: string;
  usage: AnthropicToolUsage;
}

export type IssueCategory = 'mechanical' | 'bodywork' | 'interior' | 'other';

export interface ExtractedVehicleIssue {
  description: string;
  evidence: string[];
}

export interface ExtractedVehicleIssues {
  mechanical: ExtractedVehicleIssue[];
  bodywork: ExtractedVehicleIssue[];
  interior: ExtractedVehicleIssue[];
  other: ExtractedVehicleIssue[];
}

export interface ExtractVehicleIssuesToolResult {
  issues: ExtractedVehicleIssues;
  model: string;
  usage: AnthropicToolUsage;
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface IssueAssessmentQuery {
  issue: string;
  brand: string;
  model: string;
  year?: number;
  evidence?: string[];
}

export interface IssueSeverityAndCostAssessment {
  severity: IssueSeverity;
  estimatedCostMinEUR: number;
  estimatedCostMaxEUR: number;
  reasoning: string;
  sources: KnownIssuesWebSource[];
}

export interface IssueSeverityAndCostToolResult {
  assessment: IssueSeverityAndCostAssessment;
  pricingYear: number;
  model: string;
  usage: AnthropicToolUsage;
}

export interface VehicleAnalysisService {
  checkOperationalStatus(description: string): Promise<OperationalStatusToolResult>;
  checkKnownIssuesWeb(query: VehicleQuery): Promise<KnownIssuesWebToolResult>;
  extractVehicleIssuesFromText(text: string): Promise<ExtractVehicleIssuesToolResult>;
  assessIssueSeverityAndCost(query: IssueAssessmentQuery): Promise<IssueSeverityAndCostToolResult>;
}

export type KnownIssueSeverity = 'low' | 'medium' | 'high' | 'unknown';

export interface KnownIssueMatch {
  id: string;
  description: string;
  severity: KnownIssueSeverity;
  yearFrom: number | null;
  yearTo: number | null;
  sourceUrl: string | null;
}

export interface CheckKnownIssuesResult {
  hasKnownIssues: boolean;
  issues: KnownIssueMatch[];
}

export interface MarketPriceFilters {
  brand: string;
  model: string;
  yearWindow: { from: number; to: number } | null;
}

export interface MarketPriceEstimate {
  status: 'ok';
  currency: 'EUR';
  sampleSize: number;
  filters: MarketPriceFilters;
  average: string;
  median: string;
  minimum: string;
  maximum: string;
}

export interface InsufficientMarketData {
  status: 'insufficient_data';
  currency: 'EUR';
  sampleSize: number;
  requiredSampleSize: 3;
  filters: MarketPriceFilters;
}

export type EstimateMarketPriceResult = MarketPriceEstimate | InsufficientMarketData;

export interface KnownIssueRecord {
  id: string;
  issueDescription: string;
  severity: string;
  yearFrom: number | null;
  yearTo: number | null;
  source: string | null;
}

export interface McpToolRepository {
  findKnownIssues(query: VehicleQuery): Promise<KnownIssueRecord[]>;
  findComparablePrices(query: VehicleQuery): Promise<string[]>;
}
