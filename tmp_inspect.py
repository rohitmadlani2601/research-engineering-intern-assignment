import json

with open('data.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i >= 3:
            break
        try:
            d = json.loads(line)
            data = d.get('data', {})
            print(f"--- Post {i+1} ---")
            print(f"  id: {data.get('id')}")
            print(f"  author: {data.get('author')}")
            print(f"  subreddit: {data.get('subreddit')}")
            print(f"  title: {str(data.get('title', ''))[:80]}")
            print(f"  created_utc: {data.get('created_utc')}")
            print(f"  score: {data.get('score')}")
            print(f"  url: {str(data.get('url', ''))[:80]}")
            print(f"  domain: {data.get('domain')}")
            print(f"  num_comments: {data.get('num_comments')}")
            print(f"  selftext len: {len(str(data.get('selftext', '')))}")
        except Exception as e:
            print(f"Error: {e}")
