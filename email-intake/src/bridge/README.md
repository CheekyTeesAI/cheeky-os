# Bridge Layer v1.0 (Event spine + operational memory)



## Purpose



In-process **business event log** plus a thin **operational memory** API so Cheeky OS can answer “what happened?” style questions. **Durable persistence** survives process restarts via append-only JSONL.



Flow: **AI Operator → `bridgeRouter` → `operationalMemory.service` → `eventBus` → `eventStore`** (and optional subscribers).



## Event spine



1. **`publishEvent`** normalizes an envelope, **`appendEvent`** writes to RAM **and appends JSONL**, then **`notifySubscribers`** runs handlers.

2. Subscriber throws are **logged only**; execution of the publisher continues.



## Persistent Event Spine v1



- **Append-only JSONL**: one canonical event object per line, plus **`persistedAt`** and **`schemaVersion`** on disk (`schemaVersion: 1` today).

- **File path**: `src/bridge/persistence/bridgeData/events.jsonl`

- **Replay**: on first `eventStore` use after boot, persisted rows are replayed into the in‑memory bounded store. **Duplicate `id`** lines are skipped. Malformed JSON lines are skipped with counts available via stats.

- **Why append-only**: cheap audit trail, predictable ordering, no migrations; compaction is a deliberate future phase.

- **Limitations**

  - `BRIDGE_EVENT_STORE_CAP` (default **5000**) trims **RAM** — older IDs fall out of the hot timeline but remain in the JSONL file.

  - Corrupt disks / manual edits risk skipped lines.

  - **No multi-process locking** — single Node writer assumption.

  - Replay does **not** rewrite legacy JSONL rows (additive fields only affect **new** appends).

- **Future migration**: swap `eventPersistence`/`eventStore` internals for Postgres or an event store service while preserving `publishEvent` / `bridgeRouter` contracts.



### HTTP



| Method | Path | Notes |

|--------|------|-------|

| GET | `/api/bridge/events/recent?limit=10` | Recent events (newest first) |

| GET | `/api/bridge/customer-context?customer=Jessica` | Substring match over recent payload/metadata |

| POST | `/api/bridge/events/test` | JSON body; default `type`: `EMAIL_SEARCH_REQUESTED` |

| GET | `/api/bridge/persistence/stats` | In‑memory vs persisted counts, replay stats, file path/size |



Startup log:



`[Bridge] Replayed N persisted events`



## AI Operator



`operatorRouter.runOperatorCommand` records:



- `OPERATOR_COMMAND_RECEIVED` on every command

- `OPERATOR_TOOL_EXECUTED` after handler success

- `ERROR_RECORDED` / `APPROVAL_REQUIRED` on failures and gate blocks as appropriate



## Module map



| File | Role |

|------|------|

| `eventTypes.js` | Canonical string constants |

| `eventStore.js` | Append/list/recent/entity filter + hydrate + persistence hook |

| `persistence/eventPersistence.js` | JSONL read/append/stats |

| `persistence/eventReplay.js` | Load → dedupe replay into store |

| `eventBus.js` | Publish + subscribers |

| `operationalMemory.service.js` | Timeline + customer context helpers |

| `bridgeRouter.js` | Stable facade for callers |


