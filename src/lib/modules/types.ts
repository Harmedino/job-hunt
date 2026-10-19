export const workStatuses = [
  "Saved",
  "Evaluating",
  "Applied/Claimed",
  "Working",
  "Submitted",
  "Accepted",
  "Paid",
  "Rejected",
  "Cancelled",
  "Closed",
] as const;
export const contentStatuses = [
  "Ideas",
  "Researching",
  "Script/Prompt Ready",
  "Generating",
  "Editing",
  "Scheduled",
  "Published",
] as const;
export type WorkStatus = (typeof workStatuses)[number];
export type ContentStatus = (typeof contentStatuses)[number];
export type Money = { amount: string; currency: string };
export type Reward = Money & {
  verification: "user-verified";
  evidenceUrl: string;
  fundingType?: "escrow" | "deposit";
  payoutEvidenceUrl?: string;
  conditions: string;
  eligibility: string;
  verifiedAt: string;
};
export type Bounty = {
  id: string;
  title: string;
  description: string;
  source: "GitHub" | "Algora" | "IssueHunt";
  manual: boolean;
  url: string;
  issueUrl?: string;
  repository: string;
  organization: string;
  language: string;
  skills: string[];
  status: "open" | "claimed" | "in progress" | "completed" | "unknown";
  publishedAt?: string;
  updatedAt?: string;
  checkedAt?: string;
  deadline?: string;
  sponsor: string;
  assignees: string[];
  comments?: number;
  repositoryPushedAt?: string;
  reward?: Reward;
  rewardMention?: string;
  difficulty: "unknown" | "easy" | "medium" | "hard";
  analysis?: BountyAnalysis;
};
export type BountyAnalysis = {
  score: number;
  confidence: string;
  matchedSkills: string[];
  criteria: {
    label: string;
    points: number;
    maximum: number;
    reason: string;
  }[];
  paymentRisk: string;
  eligibility: string;
  generatedAt: string;
  ai?: TaskPlan;
  aiWarning?: string;
};
export type TaskPlan = {
  explanation: string;
  requirements: string[];
  codeAreas: string[];
  challenges: string[];
  plan: string[];
  tests: string[];
  effort: string;
  effortHoursLow: number;
  effortHoursHigh: number;
  rewardValue: string;
  submission: string;
  uncertainty: string;
};
export type TrackedBounty = {
  id: string;
  bountyId: string;
  status: WorkStatus;
  notes: string;
  deadline: string;
  submissionUrl: string;
  updatedAt: string;
};
export type Payment = {
  id: string;
  bountyId: string;
  amount: string;
  currency: string;
  receivedAt: string;
  evidenceUrl: string;
  notes: string;
  confirmation: "owner-confirmed";
};
export type ModuleSettings = {
  id: string;
  bountyQuery: string;
  bountyRefresh: boolean;
  youtubeRefresh: boolean;
  refreshHours: number;
  highMatch: number;
};
export type ContentProfile = {
  id: string;
  name: string;
  niche: string;
  character: string;
  preferences: string;
  referenceTags: string;
};
export const brunoProfile: ContentProfile = {
  id: "bruno",
  name: "Bruno AI Football",
  niche: "Fictional AI football, football action and comedy",
  character:
    "Bruno: fictional male footballer, 32, Caucasian, 183 cm, 235 kg, extremely obese physique, huge round belly, broad torso, thick limbs, short messy brown curly hair, brown eyes, light beard, plain white football kit.",
  preferences:
    "Vertical 9:16 short-form. Photorealistic fictional matches. Realistic football movement and ball physics. Original stadiums and fictional surrounding players. No broadcast overlays or copied watermarks. Consistent Bruno identity. Entertaining original football action, comedy and celebrations.",
  referenceTags: "",
};
export type ResearchTopic = {
  id: string;
  title: string;
  profileId: string;
  channelId: string;
};
export type YoutubeVideo = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  duration: string;
  description: string;
  views?: string;
  likes?: string;
  comments?: string;
  url: string;
  fetchedAt: string;
  expiresAt: string;
};
export type YoutubeChannel = {
  id: string;
  title: string;
  description: string;
  url: string;
  subscribers?: string;
  views?: string;
  videoCount?: string;
  fetchedAt: string;
  expiresAt: string;
};
export type ContentIdea = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  action: string;
  hook: string;
  audience: string;
  format: string;
  duration: string;
  angle: string;
  requirements: string;
  approved: boolean;
  rejected: boolean;
  referenceIds: string[];
  updatedAt: string;
};
export type PromptVersion = {
  id: string;
  ideaId: string;
  subject: string;
  action: string;
  environment: string;
  lighting: string;
  camera: string;
  text: string;
  createdAt: string;
};
export type Metadata = {
  id: string;
  ideaId: string;
  titles: string[];
  descriptions: string[];
  hashtags: string[];
  hooks: string[];
  pinnedComments: string[];
  captions: string[];
  createdAt: string;
};
export type ContentEntry = {
  id: string;
  ideaId: string;
  title: string;
  channel: string;
  platform: string;
  targetDate: string;
  status: ContentStatus;
  notes: string;
  references: string;
  promptId: string;
  metadataId: string;
  publishedUrl: string;
  generatedComplete: boolean;
  updatedAt: string;
};
export type JournalEntry = {
  id: string;
  entryId: string;
  worked: string;
  failed: string;
  next: string;
  createdAt: string;
};
export type SourceState = {
  id: string;
  name: string;
  mode: string;
  message: string;
  checkedAt?: string;
  retryAt?: string;
};
export type IntegrationSummary = {
  id: string;
  title: string;
  connectedAt: string;
  lastSyncAt?: string;
};
export type YoutubeReport = {
  columnHeaders?: { name: string; dataType?: string }[];
  rows?: (string | number)[][];
};
export type AnalyticsSnapshot = {
  channelId: string;
  startDate: string;
  endDate: string;
  fetchedAt: string;
  reports: Record<string, { data?: YoutubeReport; unavailable?: string }>;
};
export type WorkspaceSnapshot = {
  bounties: Bounty[];
  tracked: TrackedBounty[];
  payments: Payment[];
  profiles: ContentProfile[];
  topics: ResearchTopic[];
  videos: YoutubeVideo[];
  channels: YoutubeChannel[];
  ideas: ContentIdea[];
  prompts: PromptVersion[];
  metadata: Metadata[];
  entries: ContentEntry[];
  journal: JournalEntry[];
  sources: SourceState[];
  integrations: IntegrationSummary[];
  settings: ModuleSettings;
  storageAvailable: boolean;
  warning?: string;
  configured: {
    github: boolean;
    youtube: boolean;
    oauth: boolean;
    ai: boolean;
  };
};
