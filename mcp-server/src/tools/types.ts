export interface VehicleQuery {
  brand: string;
  model: string;
  year?: number;
  force?: boolean;
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

export type IssueCategory = 'mecanica' | 'chapa' | 'interior' | 'otros';

export interface ResearchedIssue {
  description: string;
  category: IssueCategory;
  severity: KnownIssueSeverity;
  yearFrom: number | null;
  yearTo: number | null;
  source: string | null;
}

export interface KnownIssuesWebAnalysis {
  found: boolean;
  summary: string;
  sources: KnownIssuesWebSource[];
  issues: ResearchedIssue[];
}

export interface KnownIssuesWebToolResult {
  knownIssues: KnownIssuesWebAnalysis;
  model: string;
  usage: AnthropicToolUsage;
}

export interface KnownIssuesSaveResult {
  created: number;
  updated: number;
}

export interface KnownIssuesReader {
  findByModel(query: VehicleQuery): Promise<KnownIssuesWebAnalysis | null>;
}

export interface KnownIssuesWriter {
  saveResearchedIssues(query: VehicleQuery, issues: ResearchedIssue[]): Promise<KnownIssuesSaveResult>;
}

export interface KnownIssuesStore extends KnownIssuesReader, KnownIssuesWriter {}

export type KnownIssuesLookup = (query: VehicleQuery) => Promise<KnownIssuesWebAnalysis>;

export interface VehicleAnalysisService {
  checkOperationalStatus(description: string): Promise<OperationalStatusToolResult>;
  checkKnownIssuesWeb(query: VehicleQuery): Promise<KnownIssuesWebToolResult>;
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
