import { DiscussionAnalysis, ForumPost } from '../types';
import { elizaLogger } from '@elizaos/core';

export interface ProposalSection {
  title: string;
  content: string;
}

export interface TemperatureCheckPoll {
  title: string;
  description: string;
  options: string[];
  duration: number; // in days
  threshold: number; // minimum participation threshold
}

export interface ProposalDraft {
  title: string;
  author: string;
  createdAt: Date;
  status: 'draft' | 'temperature_check' | 'proposal';
  sections: ProposalSection[];
  poll?: TemperatureCheckPoll;
  sourceDiscussions: string[]; // URLs of source discussions
  tags: string[];
  estimatedImpact: {
    technical: number; // 0-1 scale
    social: number;
    economic: number;
  };
  metadata?: {
    source: string;
    platform: string;
    timestamp: Date;
    author: string;
    tags: string[];
    engagement: {
      participationRate: number;
      uniqueParticipants: number;
      totalInteractions: number;
    };
  };
}

export interface ProposalGeneratorOptions {
  includeTemperatureCheck?: boolean;
  pollDuration?: number; // in days
  minimumParticipationThreshold?: number;
  requireBudgetEstimate?: boolean;
}

const DEFAULT_OPTIONS: ProposalGeneratorOptions = {
  includeTemperatureCheck: true,
  pollDuration: 3,
  minimumParticipationThreshold: 0.1, // 10% of token holders
  requireBudgetEstimate: true,
};

export class ProposalGenerator {
  private generateAbstract(analysis: DiscussionAnalysis): ProposalSection {
    const { keyPoints, topics, stakeholders } = analysis;
    
    const content = `
This proposal addresses ${topics.slice(0, 3).join(', ')} based on community discussions.

Key Points:
${keyPoints.map(point => `- ${point}`).join('\n')}

Primary stakeholders: ${stakeholders.slice(0, 5).join(', ')}
    `.trim();

    return {
      title: 'Abstract',
      content,
    };
  }

  private generateMotivation(analysis: DiscussionAnalysis): ProposalSection {
    const { perspectives, consensus, sentiment } = analysis;
    
    const content = `
Background:
The community has expressed ${sentiment.label} sentiment regarding these topics, 
with a consensus level of ${Math.round(consensus.level * 100)}%.

Community Perspectives:
${perspectives.map(perspective => `- ${perspective}`).join('\n')}

${consensus.majorityOpinion ? `Majority Opinion: ${consensus.majorityOpinion}` : ''}
${consensus.dissenting ? `\nDissenting Views: ${consensus.dissenting}` : ''}
    `.trim();

    return {
      title: 'Motivation',
      content,
    };
  }

  private generateSpecification(analysis: DiscussionAnalysis): ProposalSection {
    const { suggestedSolutions, proposalPotential } = analysis;
    
    const content = `
Proposed Changes:
${suggestedSolutions.map((solution, index) => `${index + 1}. ${solution}`).join('\n')}

Implementation Approach:
${this.generateImplementationSteps(analysis)}

Technical Considerations:
- Impact Level: ${proposalPotential.type === 'technical' ? 'High' : 'Medium'}
- Required Changes: ${this.generateRequiredChanges(analysis)}
${this.generateBudgetEstimate(analysis)}
    `.trim();

    return {
      title: 'Specification',
      content,
    };
  }

  private generateConclusion(analysis: DiscussionAnalysis): ProposalSection {
    const { proposalPotential, engagement } = analysis;
    
    const content = `
This proposal aims to address community needs with a confidence score of ${Math.round(proposalPotential.confidence * 100)}%.

Community Engagement:
- ${engagement.uniqueParticipants} unique participants
- ${Math.round(engagement.participationRate * 100)}% participation rate
- ${engagement.totalInteractions} total interactions

Next Steps:
1. Community feedback and discussion period (1 week)
2. Temperature check poll (3 days)
3. Final proposal refinement based on feedback
4. Formal governance proposal submission

Success Metrics:
${this.generateSuccessMetrics(analysis)}
    `.trim();

    return {
      title: 'Conclusion',
      content,
    };
  }

  private generateTemperatureCheckPoll(analysis: DiscussionAnalysis, options: ProposalGeneratorOptions): TemperatureCheckPoll {
    const { title = 'Community Discussion' } = analysis.post;
    const { topics } = analysis;
    
    return {
      title: `Temperature Check: ${title}`,
      description: `This temperature check aims to gauge community sentiment on the proposed changes regarding ${topics.join(', ')}. Please vote to indicate your support level.`,
      options: [
        'Strongly Support',
        'Support with Minor Changes',
        'Need More Discussion',
        'Do Not Support',
      ],
      duration: options.pollDuration || DEFAULT_OPTIONS.pollDuration,
      threshold: options.minimumParticipationThreshold || DEFAULT_OPTIONS.minimumParticipationThreshold,
    };
  }

  private generateImplementationSteps(analysis: DiscussionAnalysis): string {
    const steps = [
      'Initial review and feedback collection',
      'Technical specification development',
      'Community review period',
      'Implementation and testing',
      'Deployment and monitoring',
    ];

    return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }

  private generateRequiredChanges(analysis: DiscussionAnalysis): string {
    // This would be expanded based on the specific type of proposal
    const changes = [];
    
    if (analysis.proposalPotential.type === 'technical') {
      changes.push('Smart contract updates');
      changes.push('Technical documentation updates');
    } else if (analysis.proposalPotential.type === 'governance') {
      changes.push('Governance parameter updates');
      changes.push('Process documentation updates');
    }

    return changes.map(change => `- ${change}`).join('\n');
  }

  private generateBudgetEstimate(analysis: DiscussionAnalysis): string {
    if (analysis.proposalPotential.type !== 'treasury') {
      return '';
    }

    return `
Budget Estimate:
- Implementation: TBD
- Ongoing maintenance: TBD
- Contingency: 10%
    `.trim();
  }

  private generateSuccessMetrics(analysis: DiscussionAnalysis): string {
    const metrics = [
      'Increased participation in governance',
      'Improved community sentiment',
      'Technical metrics (if applicable)',
      'Economic impact metrics (if applicable)',
    ];

    return metrics.map(metric => `- ${metric}`).join('\n');
  }

  public async generateProposal(
    analysis: DiscussionAnalysis,
    options: ProposalGeneratorOptions = DEFAULT_OPTIONS
  ): Promise<ProposalDraft> {
    try {
      const sections = [
        this.generateAbstract(analysis),
        this.generateMotivation(analysis),
        this.generateSpecification(analysis),
        this.generateConclusion(analysis),
      ];

      const poll = options.includeTemperatureCheck
        ? this.generateTemperatureCheckPoll(analysis, options)
        : undefined;

      const proposal: ProposalDraft = {
        title: analysis.post.title || 'Community-Driven Proposal',
        author: analysis.post.author,
        createdAt: new Date(),
        status: options.includeTemperatureCheck ? 'temperature_check' : 'draft',
        sections,
        poll,
        sourceDiscussions: [analysis.post.url],
        tags: analysis.topics ? analysis.topics.slice(0, 5) : [],
        estimatedImpact: {
          technical: analysis.proposalPotential.type === 'technical' ? 0.8 : 0.3,
          social: analysis.proposalPotential.type === 'social' ? 0.8 : 0.3,
          economic: analysis.proposalPotential.type === 'treasury' ? 0.8 : 0.3,
        },
      };

      // Add metadata
      proposal.metadata = {
        source: analysis.post.url,
        platform: analysis.post.platform,
        timestamp: analysis.post.timestamp,
        author: analysis.post.author,
        tags: analysis.topics ? analysis.topics.slice(0, 5) : [],
        engagement: {
          participationRate: analysis.engagement.participationRate,
          uniqueParticipants: analysis.engagement.uniqueParticipants,
          totalInteractions: analysis.engagement.totalInteractions
        }
      };

      return proposal;
    } catch (error) {
      elizaLogger.error('[ProposalGenerator] Error generating proposal:', error);
      throw error;
    }
  }
} 