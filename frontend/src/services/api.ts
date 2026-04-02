import axios from 'axios'
import type { AxiosInstance } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Core types ─────────────────────────────────────────────────────────────────
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

// ── Cluster types ──────────────────────────────────────────────────────────────
export interface ClusterSummary {
  cluster_id: number
  label: string
  size: number
  top_keywords: string[]
  is_small: boolean
}

export interface ClustersResponse {
  num_clusters: number
  total_posts_clustered: number
  clusters: ClusterSummary[]
  message: string | null
}

export interface ClusterPostsResponse {
  cluster_id: number
  label: string
  size: number
  top_keywords: string[]
  posts: RedditPost[]
}

// ── Time-series types ──────────────────────────────────────────────────────────
export interface TimeSeriesPoint {
  date: string
  count: number
}

export interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  summary: string
  peak_date: string | null
  peak_count: number
  total_posts: number
  date_range_days: number
  query: string | null
}

// ── Network types ──────────────────────────────────────────────────────────────
export interface NetworkNode {
  id: string
  pagerank: number
  community: number
  post_count: number
}

export interface NetworkEdge {
  source: string
  target: string
  weight: number
}

export interface NetworkResponse {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  num_nodes: number
  num_edges: number
  num_communities: number
}

// ── Embedding map types ────────────────────────────────────────────────────────
export interface EmbeddingPoint {
  post_id: string
  x: number
  y: number
  cluster_id: number
  label: string
  title?: string
  snippet?: string
}

export interface EmbeddingMapResponse {
  points: EmbeddingPoint[]
  explained_variance: number
  total_posts: number
  sampled_posts: number
}

// ── Chat types ─────────────────────────────────────────────────────────────────
export interface ChatSource {
  title: string
  text: string
  similarity: number
  subreddit: string
  url: string
  permalink: string
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  query: string
  total_retrieved: number
  message: string | null
}

// ── API client ────────────────────────────────────────────────────────────────
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

  async getClusters(): Promise<ClustersResponse> {
    const { data } = await api.get<ClustersResponse>('/api/v1/clusters')
    return data
  },

  async getClusterPosts(clusterId: number): Promise<ClusterPostsResponse> {
    const { data } = await api.get<ClusterPostsResponse>(`/api/v1/clusters/${clusterId}/posts`)
    return data
  },

  async getTimeSeries(query?: string, top_k?: number): Promise<TimeSeriesResponse> {
    const params: Record<string, string | number> = {}
    if (query && query.trim()) params.query = query.trim()
    if (top_k) params.top_k = top_k
    const { data } = await api.get<TimeSeriesResponse>('/api/v1/timeseries', { params })
    return data
  },

  async getNetwork(): Promise<NetworkResponse> {
    const { data } = await api.get<NetworkResponse>('/api/v1/network')
    return data
  },

  async getEmbeddingMap(sample?: number): Promise<EmbeddingMapResponse> {
    const params: Record<string, number> = {}
    if (sample) params.sample = sample
    const { data } = await api.get<EmbeddingMapResponse>('/api/v1/embedding-map', { params })
    return data
  },

  async chat(query: string): Promise<ChatResponse> {
    const { data } = await api.post<ChatResponse>('/api/v1/chat', { query })
    return data
  },
}
