"""
ChatService
===========
RAG (Retrieval-Augmented Generation) pipeline using only local extractive
summarisation — no external APIs, no LLM calls.

Pipeline
--------
1. Retrieve up to 30 semantically similar posts via SearchService.
2. Sources: keep only posts with similarity ≥ SOURCE_THRESHOLD (50 %).
3. Tokenise sentences from body text of shortlisted posts (body-first).
4. Score each sentence on four axes:
   a) Query relevance  — TF-IDF cosine against query (stop-word filtered).
   b) Informativeness  — penalise very short / very long sentences; reward
                         sentence length sweet spot (12-30 tokens).
   c) Source quality   — log-normalised upvote score of the parent post.
   d) Semantic weight  — re-weight by parent post similarity to the query.
5. MMR deduplication: greedily pick sentences whose BoW vector is < 0.55
   cosine similar to any already-selected sentence.
6. Assemble a 3–5 sentence extractive answer. Capitalise each sentence and
   ensure proper terminal punctuation.
7. Return answer + all sources with similarity ≥ 50 %.

Edge cases
----------
- Empty / whitespace query  → HTTP 400 from Pydantic
- Query < 3 chars           → graceful short-circuit
- No results ≥ 50 % match  → fallback summary from best available posts
- No usable body sentences  → fall back to the best title sentences
"""

from __future__ import annotations

import math
import re
from collections import Counter

import structlog

from app.models.chat import ChatResponse, ChatSource
from app.services.search_service import SearchService

logger = structlog.get_logger(__name__)


# ── Tunables ──────────────────────────────────────────────────────────────────

# Wide retrieval net — we'll filter sources to ≥ SOURCE_THRESHOLD afterwards.
_RETRIEVE_TOP_K: int = 30
_RETRIEVE_THRESHOLD: float = 0.18        # floor for initial retrieval

# Only posts at or above this similarity are surfaced as sources.
SOURCE_SIMILARITY_THRESHOLD: float = 0.50

# Sentence quality gates
_MIN_SENTENCE_TOKENS: int = 10           # sentences shorter than this are noise
_MAX_SENTENCE_TOKENS: int = 80           # very long sentences are hard to read
_IDEAL_TOKEN_RANGE: tuple[int, int] = (12, 35)  # sweet-spot for informativeness

# Answer assembly
_MAX_ANSWER_SENTENCES: int = 5
_MIN_ANSWER_SENTENCES: int = 3           # try to surface at least 3 sentences

# MMR deduplication threshold — lower = more diverse
_REDUNDANCY_THRESHOLD: float = 0.55


# ── Stop-words ────────────────────────────────────────────────────────────────
# A compact English stop-word set to keep TF-IDF meaningful.

_STOP_WORDS: frozenset[str] = frozenset({
    "a", "an", "the", "and", "or", "but", "if", "in", "on", "at", "to",
    "for", "of", "with", "by", "from", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
    "i", "we", "you", "he", "she", "they", "me", "us", "him", "her",
    "them", "my", "our", "your", "his", "their", "what", "which", "who",
    "whom", "there", "here", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "not",
    "only", "own", "same", "so", "than", "too", "very", "just", "because",
    "as", "until", "while", "about", "against", "between", "into",
    "through", "during", "before", "after", "above", "below", "up", "down",
    "out", "off", "over", "under", "again", "then", "once", "also",
    "s", "t", "re", "ve", "ll", "d", "m",
})


# ── Text helpers ──────────────────────────────────────────────────────────────

def _tokenize(text: str, remove_stops: bool = True) -> list[str]:
    """Lowercase alpha tokens, optionally filtered of stop-words."""
    tokens = re.findall(r"[a-z]+", text.lower())
    if remove_stops:
        tokens = [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]
    return tokens


def _sentence_split(text: str) -> list[str]:
    """
    Split text into sentences on sentence-terminating punctuation.
    Strips leading/trailing whitespace, collapses runs of whitespace,
    and deduplicates exact matches.
    """
    # Normalise whitespace first
    text = re.sub(r"\s+", " ", text.strip())
    # Split after ., !, ? not followed by a lowercase letter
    # (avoids splitting on abbreviations like 'U.S.' to some degree)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"])", text)
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _tf(tokens: list[str]) -> dict[str, float]:
    """Normalised term frequency."""
    total = len(tokens)
    if total == 0:
        return {}
    counts = Counter(tokens)
    return {w: c / total for w, c in counts.items()}


def _cosine_bow(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two TF-weight BoW vectors."""
    vocab = set(a) & set(b)
    if not vocab:
        return 0.0
    dot = sum(a[w] * b[w] for w in vocab)
    norm_a = sum(v * v for v in a.values()) ** 0.5
    norm_b = sum(v * v for v in b.values()) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _informativeness(n_tokens: int) -> float:
    """
    Score in [0, 1] reflecting how 'readable' a sentence of *n_tokens* is.
    Peaks at the ideal range and falls off at both ends.
    """
    lo, hi = _IDEAL_TOKEN_RANGE
    if lo <= n_tokens <= hi:
        return 1.0
    if n_tokens < lo:
        # Linear ramp-up from _MIN_SENTENCE_TOKENS
        return max(0.0, (n_tokens - _MIN_SENTENCE_TOKENS) / max(lo - _MIN_SENTENCE_TOKENS, 1))
    # Penalise very long sentences gradually
    return max(0.3, 1.0 - (n_tokens - hi) / 60.0)


def _is_noise(sentence: str, tokens: list[str]) -> bool:
    """Return True if the sentence is unlikely to be informative."""
    # Too short or too long
    if len(tokens) < _MIN_SENTENCE_TOKENS or len(tokens) > _MAX_SENTENCE_TOKENS:
        return True
    # Pure URL / markdown artefact
    if re.fullmatch(r"[^a-zA-Z]*", sentence):
        return True
    # Mostly punctuation or digits
    alpha_ratio = sum(c.isalpha() for c in sentence) / max(len(sentence), 1)
    if alpha_ratio < 0.50:
        return True
    return False


def _ensure_terminal_punct(s: str) -> str:
    """Append a full-stop if the sentence lacks terminal punctuation."""
    s = s.strip()
    if s and s[-1] not in ".!?":
        s += "."
    return s


def _capitalise(s: str) -> str:
    """Capitalise the first character of a sentence."""
    if not s:
        return s
    return s[0].upper() + s[1:]


# ── Main service ──────────────────────────────────────────────────────────────

class ChatService:
    """
    Extractive-summarisation RAG chatbot wrapping :class:`SearchService`.

    Parameters
    ----------
    search_service:
        A fully initialised :class:`SearchService` instance.
    """

    def __init__(self, search_service: SearchService) -> None:
        self._search = search_service
        logger.info("chat_service_ready")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def answer(self, query: str) -> ChatResponse:
        """
        Run the full RAG pipeline and return a structured response.

        Parameters
        ----------
        query:
            Already-stripped, non-empty user question.
        """
        log = logger.bind(query=query[:120])

        # ── Edge-case: too-short query ─────────────────────────────────
        if len(query) < 3:
            return ChatResponse(
                query=query,
                answer="Your query is too short. Please provide more detail.",
                sources=[],
                total_retrieved=0,
                message="Query too short for meaningful retrieval.",
            )

        # ── Step 1: Wide retrieval ─────────────────────────────────────
        search_resp = self._search.search(
            query=query,
            top_k=_RETRIEVE_TOP_K,
            threshold=_RETRIEVE_THRESHOLD,
        )

        if not search_resp.results:
            log.warning("chat_no_results")
            return ChatResponse(
                query=query,
                answer=(
                    "I couldn't find any relevant posts for that query. "
                    "Try rephrasing or using different keywords."
                ),
                sources=[],
                total_retrieved=0,
                message="No relevant posts found.",
            )

        log.info("chat_retrieved", count=len(search_resp.results))

        all_results = search_resp.results

        # ── Step 2: Filter sources to ≥ 50 % similarity ───────────────
        source_results = [r for r in all_results if r.similarity >= SOURCE_SIMILARITY_THRESHOLD]

        # If nothing hits 50 %, use best available (degraded mode)
        degraded = len(source_results) == 0
        if degraded:
            source_results = all_results[:5]
            log.warning(
                "chat_no_high_sim_sources",
                best_sim=all_results[0].similarity if all_results else 0.0,
            )

        # ── Step 3: Build query TF vector (stop-word filtered) ────────
        query_tokens = _tokenize(query, remove_stops=True)
        query_tf = _tf(query_tokens)

        # ── Step 4: Collect & score candidate sentences ───────────────
        # Prefer body text; title is used only as a fallback when body is empty.
        #
        # Tuple: (score, sentence_str, sent_tf_vec, parent_result)
        candidates: list[tuple[float, str, dict[str, float], object]] = []
        title_candidates: list[tuple[float, str, dict[str, float], object]] = []

        # Use the union of all retrieved posts (not just high-sim ones) so
        # the answer can benefit from the full context, but sources are filtered.
        for result in all_results:
            body = (result.text or "").strip()
            title = (result.title or "").strip()

            # ── Body sentences ────────────────────────────────────────
            if body:
                for sent in _sentence_split(body):
                    tokens = _tokenize(sent, remove_stops=False)
                    content_tokens = _tokenize(sent, remove_stops=True)
                    if _is_noise(sent, tokens):
                        continue

                    sent_tf = _tf(content_tokens)
                    score = _score_sentence(
                        sent_tf=sent_tf,
                        query_tf=query_tf,
                        n_tokens=len(tokens),
                        post_score=result.score,
                        similarity=result.similarity,
                        is_title=False,
                    )
                    candidates.append((score, sent, sent_tf, result))

            # ── Title fallback pool ───────────────────────────────────
            if title:
                t_tokens = _tokenize(title, remove_stops=False)
                t_content = _tokenize(title, remove_stops=True)
                if not _is_noise(title, t_tokens):
                    tf = _tf(t_content)
                    score = _score_sentence(
                        sent_tf=tf,
                        query_tf=query_tf,
                        n_tokens=len(t_tokens),
                        post_score=result.score,
                        similarity=result.similarity,
                        is_title=True,
                    )
                    title_candidates.append((score, title, tf, result))

        # If no body candidates, fall back to title candidates
        if not candidates:
            log.warning("chat_falling_back_to_titles")
            candidates = title_candidates

        if not candidates:
            log.error("chat_no_sentences_at_all")
            return ChatResponse(
                query=query,
                answer=(
                    "The retrieved posts don't contain enough readable text "
                    "to generate a summary for your query."
                ),
                sources=_build_sources(source_results),
                total_retrieved=len(all_results),
                message="Insufficient post body text for summarisation.",
            )

        candidates.sort(key=lambda x: x[0], reverse=True)

        # ── Step 5: MMR deduplication ──────────────────────────────────
        selected: list[str] = []
        selected_vecs: list[dict[str, float]] = []

        for _score, sent, vec, _result in candidates:
            if len(selected) >= _MAX_ANSWER_SENTENCES:
                break
            max_sim = max(
                (_cosine_bow(vec, sv) for sv in selected_vecs),
                default=0.0,
            )
            if max_sim < _REDUNDANCY_THRESHOLD:
                selected.append(sent)
                selected_vecs.append(vec)

        # Ensure minimum sentence count using lower-ranked candidates
        if len(selected) < _MIN_ANSWER_SENTENCES:
            for _score, sent, vec, _result in candidates:
                if len(selected) >= _MIN_ANSWER_SENTENCES:
                    break
                if sent not in selected:
                    selected.append(sent)
                    selected_vecs.append(vec)

        # ── Step 6: Assemble answer text ───────────────────────────────
        answer_text = _assemble_answer(selected, query)

        # ── Step 7: Build source list ──────────────────────────────────
        sources = _build_sources(source_results)

        log.info(
            "chat_answer_generated",
            sentences=len(selected),
            answer_len=len(answer_text),
            sources=len(sources),
            degraded=degraded,
        )

        message: str | None = None
        if degraded:
            message = (
                "No posts exceeded the 50% similarity threshold. "
                "Showing best available results."
            )

        return ChatResponse(
            query=query,
            answer=answer_text,
            sources=sources,
            total_retrieved=len(all_results),
            message=message,
        )


# ── Scoring ───────────────────────────────────────────────────────────────────

def _score_sentence(
    *,
    sent_tf: dict[str, float],
    query_tf: dict[str, float],
    n_tokens: int,
    post_score: int,
    similarity: float,
    is_title: bool,
) -> float:
    """
    Composite sentence quality score.

    Components
    ----------
    relevance (45 %)   : TF-IDF cosine between sentence and query.
    informativeness (25%): length-based quality score.
    source_quality (15%): log-normalised parent post upvotes.
    semantic_weight (15%): parent post cosine similarity to the query.

    Title sentences are penalised by 0.6× to strongly prefer body text.
    """
    relevance = _cosine_bow(query_tf, sent_tf) if query_tf else 0.5
    informativeness = _informativeness(n_tokens)
    source_quality = math.log1p(max(post_score, 0)) / 12.0
    semantic_weight = similarity  # already in [0, 1]

    raw = (
        relevance       * 0.45
        + informativeness * 0.25
        + source_quality  * 0.15
        + semantic_weight * 0.15
    )

    # Penalise title sentences so body sentences are strongly preferred
    if is_title:
        raw *= 0.60

    return raw


# ── Answer assembly ───────────────────────────────────────────────────────────

def _assemble_answer(sentences: list[str], query: str) -> str:
    """
    Turn a list of raw extracted sentences into a readable answer string.

    - Each sentence is capitalised and given terminal punctuation.
    - Sentences are joined with a space.
    - If the sentences come from different conceptual clusters (detected by
      low mutual overlap), a transitional phrase is inserted between the
      first and second sentence.
    """
    if not sentences:
        return "No relevant information could be extracted for this query."

    cleaned = [_ensure_terminal_punct(_capitalise(s)) for s in sentences]

    if len(cleaned) == 1:
        return cleaned[0]

    # Check diversity between first and second sentence to decide connector
    tf0 = _tf(_tokenize(cleaned[0]))
    tf1 = _tf(_tokenize(cleaned[1]))
    overlap = _cosine_bow(tf0, tf1)

    # Insert a light bridge if they are quite different (overlap < 0.1)
    if overlap < 0.10 and len(cleaned) >= 2:
        bridge = "Additionally, "
        cleaned[1] = bridge + cleaned[1][0].lower() + cleaned[1][1:]

    return " ".join(cleaned)


# ── Source builder ────────────────────────────────────────────────────────────

def _build_sources(results: list) -> list[ChatSource]:
    """
    Convert :class:`SearchResultItem` objects into :class:`ChatSource` objects.

    The *text* preview uses the first 300 characters of the post body when
    available; falls back to the title otherwise.  Sources are sorted by
    descending similarity.
    """
    seen_ids: set[str] = set()
    sources: list[ChatSource] = []

    for r in sorted(results, key=lambda x: x.similarity, reverse=True):
        if r.id in seen_ids:
            continue
        seen_ids.add(r.id)

        body = (r.text or "").strip()
        if body:
            # Trim to sentence boundary near 300 chars
            preview = body[:350]
            cut = max(
                preview.rfind("."),
                preview.rfind("!"),
                preview.rfind("?"),
            )
            if cut > 60:
                preview = preview[: cut + 1]
            else:
                preview = preview[:300]
                if preview and preview[-1] not in ".!?,":
                    preview += "…"
        else:
            preview = r.title

        sources.append(
            ChatSource(
                title=r.title,
                text=preview,
                similarity=round(r.similarity, 4),
                subreddit=r.subreddit,
                url=r.url,
                permalink=r.permalink,
            )
        )

    return sources
