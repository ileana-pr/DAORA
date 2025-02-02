import axios from 'axios';
import * as cheerio from 'cheerio';
import { ForumPost } from '../types';

interface DiscourseConfig {
  usePublicDiscourse?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export class DiscourseClient {
  private config: DiscourseConfig;
  private axiosInstance;

  constructor(config: DiscourseConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      headers: config.apiKey ? {
        'Api-Key': config.apiKey,
        'Api-Username': 'system'
      } : {}
    });
  }

  async getPosts(options: { timeframe?: string; category?: string; limit?: number } = {}): Promise<ForumPost[]> {
    if (this.config.usePublicDiscourse) {
      return this.scrapePublicPosts(options);
    }
    return this.fetchPostsViaApi(options);
  }

  private async scrapePublicPosts(options: { timeframe?: string; category?: string; limit?: number }): Promise<ForumPost[]> {
    const posts: ForumPost[] = [];
    const baseUrl = this.config.baseUrl;
    
    try {
      // Fetch the latest topics page
      const response = await this.axiosInstance.get('/latest');
      const $ = cheerio.load(response.data);
      
      // Extract topics
      const topics = $('.topic-list-item').slice(0, options.limit || 20);
      
      for (let i = 0; i < topics.length; i++) {
        const topic = topics.eq(i);
        const title = topic.find('.title a').text().trim();
        const url = topic.find('.title a').attr('href');
        
        if (!url) continue;
        
        // Fetch individual topic page
        const topicResponse = await this.axiosInstance.get(url);
        const topic$ = cheerio.load(topicResponse.data);
        
        const firstPost = topic$('.topic-post').first();
        const content = firstPost.find('.cooked').text().trim();
        const author = firstPost.find('.username').text().trim();
        const timestamp = new Date(firstPost.find('.post-date').attr('data-time') || '');
        
        posts.push({
          id: url.split('/').pop() || '',
          title,
          content,
          author,
          timestamp,
          url: `${baseUrl}${url}`,
          platform: 'discourse',
          replies: parseInt(topic.find('.replies').text().trim(), 10),
          views: parseInt(topic.find('.views').text().trim(), 10)
        });
      }
    } catch (error) {
      console.error('Error scraping Discourse forum:', error);
    }
    
    return posts;
  }

  private async fetchPostsViaApi(options: { timeframe?: string; category?: string; limit?: number }): Promise<ForumPost[]> {
    try {
      const response = await this.axiosInstance.get('/posts.json', {
        params: {
          limit: options.limit || 20,
          category: options.category
        }
      });

      return response.data.latest_posts.map((post: any) => ({
        id: post.id.toString(),
        title: post.topic_title,
        content: post.raw,
        author: post.username,
        timestamp: new Date(post.created_at),
        url: `${this.config.baseUrl}/t/${post.topic_slug}/${post.topic_id}/${post.post_number}`,
        platform: 'discourse',
        replies: post.reply_count,
        views: post.reads
      }));
    } catch (error) {
      console.error('Error fetching posts via Discourse API:', error);
      return [];
    }
  }
} 