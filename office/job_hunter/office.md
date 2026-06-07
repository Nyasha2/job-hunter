# Office: Job Hunter

# Job-focused RSS sources only — news feeds (TechCrunch, etc.) are not job boards
# and burn LLM calls screening articles that always discard.

Sources: python_jobs(max_articles=25, poll_interval=1800),
         hacker_news(max_articles=15, poll_interval=1800)
Sinks: intelligence_display(max_items=10),
       jsonl_recorder(path="matched_jobs.jsonl")

Agents:
Alex is a screener.
Morgan is a matcher.

Connections:
python_jobs's destination is Alex.
hacker_news's destination is Alex.
Alex's relevant is Morgan.
Alex's discard is jsonl_recorder.
Morgan's matched_jobs are intelligence_display and jsonl_recorder.
Morgan's discard is jsonl_recorder.
