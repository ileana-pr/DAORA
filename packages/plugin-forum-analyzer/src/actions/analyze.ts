import { 
    type Action,
    type Memory,
    type State,
    type HandlerCallback,
    type IAgentRuntime,
    ModelClass,
    elizaLogger,
    composeContext,
    generateMessageResponse
} from "@elizaos/core";
import { DiscourseClient } from "../platforms/discourse";
import { DiscordClient } from "../platforms/discord";
import { CommonwealthClient } from "../platforms/commonwealth";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { analyzeDiscussion } from "../analysis";
import { ProposalGenerator } from "../proposal/generator";
import { ProposalWorkflow } from "../proposal/workflow";

export const analyzeForumAction: Action = {
    name: "ANALYZE_FORUM",
    similes: ["SYNTHESIZE_DISCUSSIONS", "DRAFT_PROPOSAL_FROM_DISCUSSIONS", "ANALYZE_COMMUNITY_INPUT"],
    description: "Analyzes forum discussions and synthesizes them into concrete proposal suggestions using agent's knowledge",
    examples: [
        [{
            user: "user",
            content: { text: "Analyze recent forum discussions" }
        }],
        [{
            user: "user",
            content: { text: "Synthesize community feedback into proposals" }
        }],
        [{
            user: "user",
            content: { text: "Review forum posts for governance suggestions" }
        }]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if at least one platform is configured
        const hasDiscourse = !!process.env.DISCOURSE_FORUM_URL;
        const hasDiscord = !!process.env.DISCORD_API_TOKEN;
        const hasCommonwealth = !!process.env.COMMONWEALTH_SPACE;
        const hasTwitter = !!process.env.TWITTER_API_KEY && !!process.env.TWITTER_API_SECRET;
        
        return hasDiscourse || hasDiscord || hasCommonwealth || hasTwitter;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            elizaLogger.info("[ANALYZE_FORUM] Starting discussion analysis and proposal synthesis");
            
            const allPosts = [];
            
            // Initialize and fetch from Discourse if available
            if (process.env.DISCOURSE_FORUM_URL) {
                try {
                    const discourseClient = new DiscourseClient({
                        usePublicDiscourse: true,
                        baseUrl: process.env.DISCOURSE_FORUM_URL
                    });
                    
                    const discoursePosts = await discourseClient.getPosts({
                        limit: 30,
                        timeframe: "month"
                    });
                    allPosts.push(...discoursePosts);
                } catch (error) {
                    elizaLogger.error("[ANALYZE_FORUM] Error fetching Discourse posts", error);
                }
            }
            
            // Initialize and fetch from Discord if available
            if (process.env.DISCORD_API_TOKEN) {
                try {
                    const discordClient = new DiscordClient({
                        token: process.env.DISCORD_API_TOKEN,
                        channels: process.env.DISCORD_VOICE_CHANNEL_ID ? [process.env.DISCORD_VOICE_CHANNEL_ID] : []
                    });
                    
                    const discordPosts = await discordClient.getPosts({
                        limit: 30,
                        timeframe: "month"
                    });
                    allPosts.push(...discordPosts);
                } catch (error) {
                    elizaLogger.error("[ANALYZE_FORUM] Error fetching Discord posts", error);
                }
            }
            
            // Initialize and fetch from Commonwealth if available
            if (process.env.COMMONWEALTH_SPACE) {
                try {
                    const commonwealthClient = new CommonwealthClient({
                        space: process.env.COMMONWEALTH_SPACE
                    });
                    
                    const commonwealthPosts = await commonwealthClient.getPosts({
                        limit: 30,
                        timeframe: "month"
                    });
                    allPosts.push(...commonwealthPosts);
                } catch (error) {
                    elizaLogger.error("[ANALYZE_FORUM] Error fetching Commonwealth posts", error);
                }
            }

            // Initialize and fetch from Twitter if available
            if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
                try {
                    const twitterClient = await TwitterClientInterface.start(runtime);
                    if (twitterClient) {
                        // Get Twitter Spaces discussions
                        const spaces = await (twitterClient as any).getSpaces({
                            state: 'ended',
                            limit: 30
                        });

                        // Transform Spaces into ForumPost format
                        const twitterPosts = spaces.map(space => ({
                            id: space.id,
                            title: space.title,
                            content: space.transcript || `Space Title: ${space.title}\nParticipants: ${space.participantCount}`,
                            author: space.creatorId,
                            timestamp: new Date(space.createdAt),
                            url: `https://twitter.com/i/spaces/${space.id}`,
                            platform: 'twitter_spaces',
                            reactions: [],
                            views: space.participantCount || 0,
                        }));

                        allPosts.push(...twitterPosts);
                    }
                } catch (error) {
                    elizaLogger.error("[ANALYZE_FORUM] Error fetching Twitter Spaces:", error);
                }
            }
            
            if (allPosts.length === 0) {
                callback({ text: "No posts could be retrieved from any configured platforms. Please check your platform configurations and try again." });
                return;
            }

            // First pass: Analyze discussions and group related topics
            const discussionGroups = new Map<string, Array<any>>();
            const discussionInsights = [];
            const proposalGenerator = new ProposalGenerator();
            const proposals = [];

            for (const post of allPosts) {
                const analysis = await analyzeDiscussion(post, {
                    minEngagementThreshold: 0.3,
                    includeSentiment: true,
                    includeConsensus: true
                });

                // Only generate proposals for discussions with high proposal potential
                if (analysis.proposalPotential.score > 0.6) {
                    const proposal = await proposalGenerator.generateProposal(analysis, {
                        includeTemperatureCheck: true,
                        pollDuration: 3,
                        minimumParticipationThreshold: 0.1
                    });

                    // Initialize workflow for the proposal
                    const workflow = new ProposalWorkflow(proposal);
                    proposals.push({ proposal, workflow });
                }

                // Group related discussions
                if (analysis && analysis.topics) {
                    analysis.topics.forEach(topic => {
                        const existingGroup = discussionGroups.get(topic) || [];
                        existingGroup.push({
                            post,
                            analysis
                        });
                        discussionGroups.set(topic, existingGroup);
                    });
                }

                // Collect key insights
                discussionInsights.push({
                    topic: post.title,
                    keyPoints: analysis.keyPoints,
                    communityPerspective: analysis.perspectives,
                    suggestedSolutions: analysis.suggestedSolutions,
                    context: post.content,
                    engagement: analysis.engagement,
                    stakeholders: analysis.stakeholders,
                    platform: post.platform
                });
            }

            // Generate summary response
            let responseText = `I've analyzed ${allPosts.length} community discussions across multiple platforms and identified ${proposals.length} potential proposals.\n\n`;

            // Add platform breakdown
            const platformCounts = allPosts.reduce((acc, post) => {
                acc[post.platform] = (acc[post.platform] || 0) + 1;
                return acc;
            }, {});

            responseText += "Sources:\n";
            Object.entries(platformCounts).forEach(([platform, count]) => {
                responseText += `- ${platform}: ${count} discussions\n`;
            });
            responseText += "\n";

            if (proposals.length > 0) {
                responseText += "Here are the generated proposals:\n\n";
                
                for (const { proposal } of proposals) {
                    responseText += `## ${proposal.title}\n\n`;
                    
                    for (const section of proposal.sections) {
                        responseText += `### ${section.title}\n${section.content}\n\n`;
                    }

                    if (proposal.poll) {
                        responseText += `### Temperature Check Poll\n`;
                        responseText += `${proposal.poll.description}\n\n`;
                        responseText += `Options:\n${proposal.poll.options.map(opt => `- ${opt}`).join('\n')}\n\n`;
                    }

                    responseText += `Impact Assessment:\n`;
                    responseText += `- Technical Impact: ${Math.round(proposal.estimatedImpact.technical * 100)}%\n`;
                    responseText += `- Social Impact: ${Math.round(proposal.estimatedImpact.social * 100)}%\n`;
                    responseText += `- Economic Impact: ${Math.round(proposal.estimatedImpact.economic * 100)}%\n\n`;
                    responseText += `Source Discussions: ${proposal.sourceDiscussions.join(', ')}\n`;
                    responseText += `---\n\n`;
                }
            } else {
                responseText += "No discussions met the threshold for proposal generation. Consider lowering the threshold or analyzing more recent discussions.\n\n";
            }

            // Add discussion insights summary
            responseText += "\nKey Discussion Insights:\n";
            const topTopics = Array.from(discussionGroups.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5);

            topTopics.forEach(([topic, discussions]) => {
                responseText += `\n## ${topic} (${discussions.length} discussions)\n`;
                const keyPoints = new Set(discussions.flatMap(d => d.analysis.keyPoints));
                responseText += Array.from(keyPoints).map(point => `- ${point}`).join('\n');
                responseText += '\n';
            });

            callback({ text: responseText });
        } catch (error) {
            elizaLogger.error("[ANALYZE_FORUM] Error during discussion analysis and proposal synthesis", error);
            callback({ text: "An error occurred during discussion analysis and proposal synthesis." });
        }
    }
};  