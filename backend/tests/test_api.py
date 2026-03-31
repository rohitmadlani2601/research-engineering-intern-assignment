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
