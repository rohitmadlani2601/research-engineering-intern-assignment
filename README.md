# NarrativeLens: Social Media Analysis Dashboard

## Overview
NarrativeLens is an investigative reporting dashboard designed to analyze and visualize the spread of information, topics, and narratives across social media. It features an interactive UI for exploring time-series data, clustering posts by topic, visualizing embeddings, and semantically querying a large dataset of social media posts.

## 🌐 Live Demo & Walkthrough
- **Public Dashboard**: [https://narrativelens-demo.vercel.app](https://narrativelens-demo.vercel.app) *(Replace with actual deployment URL)*
- **Video Walkthrough**: [Watch on YouTube](https://youtube.com/watch?v=...) *(Replace with actual video URL)*

## 📸 Screenshots
*(Ensure you place the actual screenshots in a `docs/` folder or update the paths below before submitting)*
![Dashboard Overview](./docs/dashboard.png)
![Embedding Visualization](./docs/embedding_viz.png)
![Network Graph](./docs/network_viz.png)

## 🔍 Semantic Search Examples

Our semantic search leverages vector embeddings to return relevant posts even when there is zero keyword overlap with the query.

1. **Query**: `"companies trying to monopolise industries"`
   - **Result Returned**: A post discussing "corporate consolidation and anti-trust behaviors in big tech."
   - **Why it's correct**: The model understands the semantic relationship between "monopolise" and "corporate consolidation/anti-trust" without relying on exact word matches.

2. **Query**: `"how to overthrow the ruling class"`
   - **Result Returned**: A post emphasizing "grassroots organizing, direct action, and dismantling systemic power structures in our communities."
   - **Why it's correct**: Matches the underlying conceptual intent of revolution and systemic change to "dismantling systemic power structures".

3. **Query**: `"wealth gap getting worse"`
   - **Result Returned**: A discussion regarding how "the growing disparity between the ultra-rich and everyday people is unsustainable."
   - **Why it's correct**: Connects the informal "wealth gap getting worse" with the more formal vocabulary of "growing disparity between the ultra-rich and everyday people."

## 🧠 ML / AI Components

We leverage ML and AI strictly for clustering, semantic search, and visualizations in the backend. Below are the key components, parameters, and libraries used:

- **Semantic Search & Document Embeddings**: 
  - **Algorithm**: SentenceTransformers (`all-MiniLM-L6-v2`) matching via L2-normalized dot product.
  - **Parameters**: 384 dimensions, Cosine Similarity distance metric.
  - **Libraries**: `sentence-transformers`, `numpy`.

- **Extractive Chatbot / Summarization**:
  - **Algorithm**: TF-IDF relevance scoring coupled with MMR (Maximal Marginal Relevance) deduplication on retrieved document sentences. No external LLM used.
  - **Parameters**: Redundancy cosine similarity threshold < 0.55, Sentence length token bounds [12, 35].
  - **Libraries**: Native Python (`re`, `collections.Counter`), `numpy`.

- **Topic Clustering**:
  - **Algorithm**: KMeans clustering with dynamic *k* discovery via second-derivative elbow heuristic. Topics are labeled using TF-IDF.
  - **Parameters**: *k* range in [5, 10], L2-normalized Euclidean distance (proxy for cosine distance).
  - **Libraries**: `scikit-learn` (`KMeans`, `TfidfVectorizer`).

- **Embedding Visualization**:
  - **Algorithm**: Principal Component Analysis (PCA) projection from 384D to 2D.
  - **Parameters**: 2 components, bounding projection within [-1, 1], sample ceiling of 3,000 points.
  - **Libraries**: `scikit-learn` (`PCA`, `MinMaxScaler`).

## ⚙️ Running Locally

1. Set up your Python environment and install dependencies from `backend/requirements.txt`.
2. Ensure you have the dataset (e.g. `data.jsonl`) properly linked or downloaded into `backend/data/`.
3. Start the backend: `cd backend && uvicorn app.main:app --reload`.
4. Run the frontend according to its specific package manager rules (e.g. `npm run dev`).