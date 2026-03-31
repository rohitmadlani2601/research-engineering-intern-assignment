import axios from 'axios'
import type { AxiosInstance } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

export interface HealthStatus {
  status: string
  version: string
  environment: string
  dataset_loaded: boolean
  total_posts: number | null
  uptime_seconds: number
}

export interface RedditPost {
  id: string
  title: string
  text: string
  author: string
  subreddit: string
  score: number
  upvote_ratio: number
  num_comments: number
  created_utc: string
  url: string
  domain: string
  permalink: string
  is_self: boolean
  over_18: boolean
  stickied: boolean
  num_crossposts: number
  hashtags: string[]
  urls_in_text: string[]
}

export interface PaginatedPosts {
  total: number
  page: number
  page_size: number
  pages: number
  items: RedditPost[]
}

export interface PostsQuery {
  page?: number
  page_size?: number
  subreddit?: string
  author?: string
  q?: string
}

export interface SearchResultItem extends RedditPost {
  rank: number
  similarity: number
}

export interface SemanticSearchResponse {
  query: string
  top_k: number
  total_results: number
  results: SearchResultItem[]
  embedding_model: string
  message: string | null
}

export const narrativeLensApi = {
  async getHealth(): Promise<HealthStatus> {
    const { data } = await api.get<HealthStatus>('/health')
    return data
  },

  async getPosts(query: PostsQuery = {}): Promise<PaginatedPosts> {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== '')
    )
    const { data } = await api.get<PaginatedPosts>('/api/v1/posts', { params })
    return data
  },

  async getPost(id: string): Promise<RedditPost> {
    const { data } = await api.get<RedditPost>(`/api/v1/posts/${id}`)
    return data
  },

  async getSubreddits(): Promise<string[]> {
    const { data } = await api.get<string[]>('/api/v1/posts/meta/subreddits')
    return data
  },

  async semanticSearch(query: string, top_k: number = 1000, threshold: number = 0.20): Promise<SemanticSearchResponse> {
    const { data } = await api.post<SemanticSearchResponse>('/api/v1/semantic-search', { query, top_k, threshold })
    return data
  },
}
