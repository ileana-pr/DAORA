export interface ForumPost {
  id: string;
  title?: string;
  content: string;
  author: string;
  timestamp: Date;
  url: string;
  platform: 'discourse' | 'discord' | 'commonwealth';
  reactions?: Array<{ count: number }>;
  replies?: number;
  views?: number;
}

export interface DiscussionAnalysis {
  post: ForumPost;
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
  };
  engagement: {
    participationRate: number;
    uniqueParticipants: number;
    totalInteractions: number;
  };
  proposalPotential: {
    score: number;
    confidence: number;
    type: 'governance' | 'treasury' | 'technical' | 'social' | 'other';
    keyPoints: string[];
  };
  consensus: {
    level: number;
    majorityOpinion?: string;
    dissenting?: string;
  };
  topics: string[];
  perspectives: string[];
  suggestedSolutions: string[];
  stakeholders: string[];
  keyPoints: string[];
}

export interface ForumAnalyzerConfig {
  platforms: {
    discourse?: {
      usePublicDiscourse?: boolean;
      apiKey?: string;
      baseUrl?: string;
    };
    discord?: {
      token?: string;
      channels?: string[];
    };
    commonwealth?: {
      apiKey?: string;
      space?: string;
    };
  };
  analysisOptions?: {
    minEngagementThreshold?: number;
    proposalThreshold?: number;
    includeSentiment?: boolean;
    includeConsensus?: boolean;
  };
} 