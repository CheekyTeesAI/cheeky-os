# Semantic Memory Layer v1.0 — retrieval scaffolding

This package turns **persisted Bridge events** into **deterministic retrieval units** (“memory fragments”), without embeddings, vectors, LLM reranking, or new infrastructure.

### Philosophy

Operational truth stays in the Bridge JSONL spine. Semantic memory builds a **cheap index** suitable for timelines, dashboards, ChatGPT-assisted digests later, or RAG backends **later** via the same envelopes.

### Fragment architecture (`memoryFragments.buildMemoryFragment`)

Each Bridge event converts into one normalized fragment carrying:

| Field | Role |
|--------|-----|
| `searchableText` | Lower‑cased, flattened payload + metadata + anchors |
| `keywords` | Simple token harvesting for inverted indexes |
| `memoryType` | High‑level taxonomy (`memoryTypes`) |
| `summary` | One‑line heuristic summary |

### Deterministic retrieval

`memoryRanking.rankMemoryResults` blends:

- Keyword frequency in `searchableText` / summaries  
- Entity id / heuristic entity hits  
- Recency boosts (half‑life ~96h)  
- Memory‑type scalar weights (**no AI**)  

Determinism ⇒ reproducible regressions/tests later.

### Why embeddings deferred

Infrastructure law for this repo phase: ship architecture + safety first. Vector DB + embeddings require storage budget, batch jobs, and privacy review.

### Future vector / RAG path

1. Keep JSONL + fragment schema stable.  
2. Add `embedding` + `embeddingModel` fields (optional) on fragments in a **new** store or sidecar file.  
3. Swap `memorySearch.searchMemory` candidate generation with ANN while keeping `memoryRouter` HTTP surface.

### Indexing lifecycle

1. **Live append** — `eventStore.appendEvent` calls `memoryIndexer.indexEvent` (or full `rebuildMemoryIndex` when RAM prune drops history).  
2. **Replay** — `finalizeReplayBatch` rebuilds from the **post‑replay** in‑memory slice (aligned with `BRIDGE_EVENT_STORE_CAP`).  
3. **Full history** — `POST /api/semantic-memory/rebuild-indexes` replays from **entire** `events.jsonl`, independent of RAM window.

> **Note:** `/api/memory` is already used by an older Cheeky OS router. These endpoints live under **`/api/semantic-memory`** to avoid route collisions.

### Example question

> “How did the Jessica issue evolve over time?”

→ `GET /api/semantic-memory/customer?customer=Jessica` for ranked fragments, or  
→ `GET /api/semantic-memory/timeline?customer=Jessica` for chronological groups (~45‑minute proximity bands).  
Future AI can summarize the returned `entries` / `groups` without mutating source events.

### Module map

| File | Role |
|------|------|
| `memoryTypes.js` | Taxonomy constants |
| `memoryFragments.js` | Event → fragment builder |
| `memoryIndexer.js` | In‑memory inverted maps |
| `memoryRanking.js` | Deterministic scoring |
| `memorySearch.js` | Query + customer + recent context |
| `memoryTimeline.js` | Chronology + grouping |
| `memoryRouter.js` | Facade + JSONL rebuild |
