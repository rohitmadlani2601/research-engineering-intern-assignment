from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.post import RedditPost
from app.services.post_service import PostService
from datetime import datetime, timezone


def _make_post(idx: int = 1) -> RedditPost:
    return RedditPost(
        id=f"test{idx:04d}",
        title=f"Test Post {idx}",
        text="Sample body text about climate change and politics",
        author=f"user_{idx}",
        subreddit="testsubreddit",
        score=100 * idx,
        upvote_ratio=0.95,
        num_comments=10,
        created_utc=datetime(2024, 1, idx if idx <= 28 else 1, tzinfo=timezone.utc),
        url=f"https://reddit.com/r/testsubreddit/comments/test{idx:04d}",
        domain="self.testsubreddit",
        permalink=f"/r/testsubreddit/comments/test{idx:04d}",
        is_self=True,
        over_18=False,
        stickied=False,
        num_crossposts=0,
    )


@pytest.fixture
def posts() -> list[RedditPost]:
    return [_make_post(i) for i in range(1, 26)]  # 25 posts


@pytest.fixture
def client(posts: list[RedditPost]) -> TestClient:
    app = create_app()
    app.state.post_service = PostService(posts)
    return TestClient(app, raise_server_exceptions=True)


class TestHealth:
    def test_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["dataset_loaded"] is True
        assert body["total_posts"] == 25

    def test_version_present(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert "version" in resp.json()


class TestPosts:
    def test_list_default_page(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 25
        assert body["page"] == 1
        assert len(body["items"]) == 20  # default page size

    def test_pagination(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?page=2&page_size=10")
        assert resp.status_code == 200
        body = resp.json()
        assert body["page"] == 2
        assert len(body["items"]) == 10

    def test_keyword_filter(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?q=climate")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 25  # all posts match

    def test_subreddit_filter(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?subreddit=testsubreddit")
        assert resp.status_code == 200
        assert resp.json()["total"] == 25

    def test_author_filter_no_results(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?author=nobody")
        assert resp.json()["total"] == 0

    def test_get_post_by_id(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts/test0001")
        assert resp.status_code == 200
        assert resp.json()["id"] == "test0001"

    def test_get_post_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts/doesnotexist")
        assert resp.status_code == 404

    def test_subreddits_list(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts/meta/subreddits")
        assert resp.status_code == 200
        assert "testsubreddit" in resp.json()

    def test_page_size_exceeds_max(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?page_size=999")
        assert resp.status_code == 422  # validation error

    def test_full_text_in_response(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts/test0001")
        assert resp.status_code == 200
        body = resp.json()
        assert "full_text" in body
        assert body["full_text"] == "Test Post 1 Sample body text about climate change and politics"

    def test_full_text_search(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts?q=Test Post 1")
        assert resp.status_code == 200
        assert resp.json()["total"] > 0


class TestTimestamp:
    def test_created_utc_is_iso_utc_in_response(self, client: TestClient) -> None:
        resp = client.get("/api/v1/posts/test0001")
        assert resp.status_code == 200
        ts = resp.json()["created_utc"]
        assert isinstance(ts, str)
        assert "T" in ts
        assert ts.endswith("+00:00") or ts.endswith("Z")

    def test_parse_utc_from_float(self) -> None:
        post = RedditPost(
            id="ts1",
            title="T",
            text="",
            author="u",
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=1_739_858_460.0,
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.created_utc.tzinfo is not None
        assert post.created_utc.tzinfo == timezone.utc
        assert post.created_utc.isoformat().endswith("+00:00")

    def test_parse_utc_naive_datetime_gets_utc(self) -> None:
        naive = datetime(2024, 6, 1, 12, 0, 0)
        post = RedditPost(
            id="ts2",
            title="T",
            text="",
            author="u",
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=naive,
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.created_utc.tzinfo == timezone.utc


class TestFullTextEdgeCases:
    def test_missing_selftext(self) -> None:
        post = RedditPost(
            id="edge1",
            title="Only Title",
            text="",
            author="u",
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.full_text == "Only Title"

    def test_missing_title(self) -> None:
        post = RedditPost(
            id="edge2",
            title="",
            text="Only Body",
            author="u",
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.full_text == "Only Body"

    def test_both_empty(self) -> None:
        post = RedditPost(
            id="edge3",
            title="",
            text="",
            author="u",
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.full_text == ""

    def test_none_coerced_fields(self) -> None:
        post = RedditPost(
            id="edge4",
            title=None,
            text=None,
            author=None,
            subreddit="s",
            score=0,
            upvote_ratio=0.0,
            num_comments=0,
            created_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
            url="",
            domain="",
            permalink="",
            is_self=True,
            over_18=False,
            stickied=False,
            num_crossposts=0,
        )
        assert post.full_text == ""
        assert post.title == ""
        assert post.text == ""


class TestSafeGet:
    """Unit-tests for the null-safe dict accessor."""

    from app.utils.helpers import safe_get

    def test_missing_key_returns_default(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({}, "title", "") == ""

    def test_none_value_returns_default(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({"author": None}, "author", "[deleted]") == "[deleted]"

    def test_none_value_str_default(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({"title": None}, "title", "") == ""

    def test_present_value_returned(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({"score": 42}, "score", 0) == 42

    def test_zero_value_not_treated_as_missing(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({"score": 0}, "score", 99) == 0

    def test_false_value_not_treated_as_missing(self) -> None:
        from app.utils.helpers import safe_get
        assert safe_get({"is_self": False}, "is_self", True) is False


class TestDatasetRobustness:
    """Tests that _parse_raw_row and load_posts handle noisy real-world data."""

    def _base_data(self) -> dict:
        return {
            "id": "abc123",
            "title": "Hello world",
            "selftext": "Some body",
            "author": "user1",
            "subreddit": "python",
            "score": 10,
            "upvote_ratio": 0.9,
            "num_comments": 5,
            "created_utc": 1_739_858_460.0,
            "url": "https://reddit.com/r/python/abc123",
            "domain": "self.python",
            "permalink": "/r/python/abc123",
            "is_self": True,
            "over_18": False,
            "stickied": False,
            "num_crossposts": 0,
        }

    def test_null_title_defaults_to_empty(self) -> None:
        from app.services.dataset import _parse_raw_row
        data = self._base_data()
        data["title"] = None
        row = _parse_raw_row(data)
        assert row["title"] == ""

    def test_null_selftext_defaults_to_empty(self) -> None:
        from app.services.dataset import _parse_raw_row
        data = self._base_data()
        data["selftext"] = None
        row = _parse_raw_row(data)
        assert row["text"] == ""

    def test_null_author_defaults_to_deleted(self) -> None:
        from app.services.dataset import _parse_raw_row
        data = self._base_data()
        data["author"] = None
        row = _parse_raw_row(data)
        assert row["author"] == "[deleted]"

    def test_full_text_safe_when_both_null(self) -> None:
        from app.services.dataset import _parse_raw_row
        data = self._base_data()
        data["title"] = None
        data["selftext"] = None
        row = _parse_raw_row(data)
        assert row["full_text"] == ""

    def test_missing_required_field_skipped(self) -> None:
        """Records with null required fields must not be loaded."""
        import tempfile, json
        from pathlib import Path
        from app.services.dataset import load_posts

        data = self._base_data()
        data["author"] = None  # required field is null

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as f:
            f.write(json.dumps(data) + "\n")
            tmp = Path(f.name)

        posts = load_posts(tmp)
        tmp.unlink()
        assert posts == []

    def test_valid_row_loaded(self) -> None:
        """A fully valid row must be loaded without error."""
        import tempfile, json
        from pathlib import Path
        from app.services.dataset import load_posts

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as f:
            f.write(json.dumps(self._base_data()) + "\n")
            tmp = Path(f.name)

        posts = load_posts(tmp)
        tmp.unlink()
        assert len(posts) == 1
        assert posts[0].id == "abc123"
        assert posts[0].author == "user1"

    def test_malformed_json_skipped(self) -> None:
        """Lines that are not valid JSON must be skipped, not crash."""
        import tempfile
        from pathlib import Path
        from app.services.dataset import load_posts

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as f:
            f.write("{this is not json}\n")
            tmp = Path(f.name)

        posts = load_posts(tmp)
        tmp.unlink()
        assert posts == []
