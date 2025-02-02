import natural from 'natural';
import { ForumPost, DiscussionAnalysis } from './types';

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');

// Keywords that indicate potential governance proposals
const PROPOSAL_KEYWORDS = [
  'proposal', 'propose', 'governance', 'vote', 'voting', 'decision',
  'treasury', 'fund', 'funding', 'budget', 'allocation', 'grant',
  'improvement', 'upgrade', 'change', 'modify', 'update', 'implement',
  'strategy', 'policy', 'protocol', 'parameter', 'framework'
];

// Keywords that indicate high engagement/importance
const IMPORTANCE_KEYWORDS = [
  'urgent', 'important', 'critical', 'crucial', 'significant',
  'essential', 'necessary', 'required', 'needed', 'priority'
];

interface AnalysisOptions {
  minEngagementThreshold?: number;
  proposalThreshold?: number;
  includeSentiment?: boolean;
  includeConsensus?: boolean;
}

export async function analyzeDiscussion(post: ForumPost, options: AnalysisOptions = {}): Promise<DiscussionAnalysis> {
  const tokens = tokenizer.tokenize(post.content.toLowerCase());
  const proposalScore = calculateProposalScore(tokens);
  const sentimentResult = analyzeSentiment(post.content);
  const engagementScore = calculateEngagementScore(post);
  
  return {
    post,
    sentiment: {
      score: sentimentResult.score,
      label: getSentimentLabel(sentimentResult.score)
    },
    engagement: {
      participationRate: calculateParticipationRate(post),
      uniqueParticipants: getUniqueParticipants(post),
      totalInteractions: calculateTotalInteractions(post)
    },
    proposalPotential: {
      score: proposalScore,
      confidence: calculateConfidence(proposalScore, engagementScore),
      type: determineProposalType(tokens),
      keyPoints: extractKeyPoints(post.content)
    },
    consensus: analyzeConsensus(post)
  };
}

function calculateProposalScore(tokens: string[]): number {
  let score = 0;
  const tfidf = new TfIdf();
  
  tfidf.addDocument(tokens);
  
  // Calculate score based on proposal keywords
  PROPOSAL_KEYWORDS.forEach(keyword => {
    const measure = tfidf.tfidf(keyword, 0);
    score += measure;
  });
  
  // Normalize score to 0-1 range
  return Math.min(score / (PROPOSAL_KEYWORDS.length * 2), 1);
}

function analyzeSentiment(content: string) {
  const words = tokenizer.tokenize(content);
  const score = sentiment.getSentiment(words);
  
  return {
    score: normalizeScore(score, -5, 5) // Normalize from AFINN range to -1 to 1
  };
}

function getSentimentLabel(score: number): 'positive' | 'negative' | 'neutral' {
  if (score > 0.1) return 'positive';
  if (score < -0.1) return 'negative';
  return 'neutral';
}

function calculateEngagementScore(post: ForumPost): number {
  const baseScore = 
    (post.replies || 0) * 2 + 
    (post.views || 0) / 100 +
    (post.reactions?.reduce((sum, r) => sum + r.count, 0) || 0) * 1.5;
    
  return Math.min(baseScore / 1000, 1); // Normalize to 0-1
}

function calculateParticipationRate(post: ForumPost): number {
  const uniqueParticipants = getUniqueParticipants(post);
  const totalInteractions = calculateTotalInteractions(post);
  
  return totalInteractions > 0 ? uniqueParticipants / totalInteractions : 0;
}

function getUniqueParticipants(post: ForumPost): number {
  // This is a placeholder - in a real implementation, we'd track unique participants
  // through replies and reactions
  return 1; // Minimum is the original poster
}

function calculateTotalInteractions(post: ForumPost): number {
  return (
    1 + // Original post
    (post.replies || 0) +
    (post.reactions?.reduce((sum, r) => sum + r.count, 0) || 0)
  );
}

function calculateConfidence(proposalScore: number, engagementScore: number): number {
  // Weight both scores equally
  return (proposalScore + engagementScore) / 2;
}

function determineProposalType(tokens: string[]): 'governance' | 'treasury' | 'technical' | 'social' | 'other' {
  const types = {
    governance: ['governance', 'vote', 'proposal', 'policy'],
    treasury: ['treasury', 'fund', 'budget', 'grant'],
    technical: ['technical', 'protocol', 'code', 'implementation'],
    social: ['community', 'social', 'communication', 'culture']
  };
  
  const scores = Object.entries(types).map(([type, keywords]) => ({
    type,
    score: keywords.reduce((sum, keyword) => 
      sum + tokens.filter(t => t === keyword).length, 0
    )
  }));
  
  const maxScore = Math.max(...scores.map(s => s.score));
  const topType = scores.find(s => s.score === maxScore);
  
  return (topType?.type as 'governance' | 'treasury' | 'technical' | 'social') || 'other';
}

function extractKeyPoints(content: string): string[] {
  const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const tfidf = new TfIdf();
  
  sentences.forEach(sentence => tfidf.addDocument(sentence));
  
  // Get the most important sentences based on TF-IDF scores
  const sentenceScores = sentences.map((sentence, index) => ({
    sentence,
    score: calculateSentenceImportance(sentence, tfidf, index)
  }));
  
  return sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.sentence);
}

function calculateSentenceImportance(sentence: string, tfidf: any, docIndex: number): number {
  const words = tokenizer.tokenize(sentence.toLowerCase());
  let score = 0;
  
  // Score based on proposal and importance keywords
  [...PROPOSAL_KEYWORDS, ...IMPORTANCE_KEYWORDS].forEach(keyword => {
    score += tfidf.tfidf(keyword, docIndex);
  });
  
  return score;
}

function analyzeConsensus(post: ForumPost) {
  // This is a simplified consensus analysis
  // In a real implementation, we'd analyze reply sentiment and reaction patterns
  return {
    level: 0.5, // Default neutral consensus
    majorityOpinion: undefined,
    dissenting: undefined
  };
}

function normalizeScore(score: number, min: number, max: number): number {
  return (score - min) / (max - min) * 2 - 1;
} 