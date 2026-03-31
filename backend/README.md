# NarrativeLens — Backend

A production-grade FastAPI backend for analyzing how narratives spread across Reddit.

## Architecture

```
backend/
├── app/
│   ├── api/            # Route handlers (thin; delegate to services)
│   ├── core/           # Config (pydantic-settings) + structured logging
│   ├── models/         # Pydantic schemas (request / response / domain)
│   ├── services/       # Business logic (dataset loader, post service)
│   ├── utils/          # Stateless helpers (text extraction, pagination)
│   └── main.py         # App factory + lifespan hook
├── data/               # Symlink or copy of data.jsonl
├── Dockerfile          # Multi-stage, GCP-optimized
└── requirements.txt
```

## Local Development

### 1. Create virtual environment

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up data directory

```bash
# From repo root — symlink or copy the dataset
mkdir -p backend/data
cp data.jsonl backend/data/data.jsonl
```

### 4. Run the server

```bash
cd backend
uvicorn app.main:app --reload --port 8080
```

API docs available at: http://localhost:8080/docs

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server port |
| `DEBUG` | `false` | Enable live reload |
| `ENVIRONMENT` | `production` | Runtime environment label |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `LOG_FORMAT` | `json` | `json` or `console` |
| `MAX_ROWS_IN_MEMORY` | `100000` | Dataset row cap |

## Running Tests

```bash
pytest tests/ -v
```

## Docker (Local)

```bash
# Build
docker build -t narrativelens-backend .

# Run
docker run -p 8080:8080 narrativelens-backend
```

## GCP Cloud Run Deployment

```bash
# Build & push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/narrativelens-backend

# Deploy
gcloud run deploy narrativelens-backend \
  --image gcr.io/YOUR_PROJECT/narrativelens-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | System status + dataset info |
| `GET` | `/api/v1/posts` | Paginated post list (filter by subreddit, author, query) |
| `GET` | `/api/v1/posts/{id}` | Single post by Reddit ID |
| `GET` | `/api/v1/posts/meta/subreddits` | All unique subreddits |
