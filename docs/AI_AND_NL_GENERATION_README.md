# AI and NL Generation README

This README explains the two natural-language capabilities in LakeStream CEP Builder in detail:

1. **AI Pipeline Generation** (`/api/ai/generate`)  
2. **NL Pattern Generation** (`/api/pattern/nl-generate`)

They are related, but they solve different problems at different levels of the authoring workflow.

---

## Why There Are Two Features

A single natural-language entry point is convenient, but it is not always precise enough for CEP-heavy workflows. In practice, users need two different kinds of assistance:

- **Macro-level generation**: "Build the whole pipeline."
- **Micro-level generation**: "Configure this pattern correctly."

That is why LakeStream has both:

- **AI Pipeline Generation** for end-to-end graph synthesis.
- **NL Pattern Generation** for focused CEP node authoring and refinement.

---

## Quick Comparison

| Area | AI Pipeline Generation | NL Pattern Generation |
|---|---|---|
| Endpoint | `POST /api/ai/generate` | `POST /api/pattern/nl-generate` |
| Scope | Full pipeline graph | Single CEP pattern node |
| Typical output | Nodes + edges + metadata | `node_type` + label + config |
| Best timing | Start of workflow | During refinement/tuning |
| Strength | Speed to first draft | Pattern precision and safe config |
| Common user | Analyst/DE building from scratch | DE/streaming specialist tuning logic |

---

## 1) AI Pipeline Generation (Full Graph)

### What it does

Given a high-level requirement, this endpoint generates a complete pipeline draft:

- pipeline name and description
- multiple nodes (source, transforms, patterns, sinks)
- graph edges between nodes

### Endpoint

- `POST /api/ai/generate`

### Example prompt

> "Build a real-time fraud detection pipeline. Read from Kafka topic `card_txn`, detect if the same card has more than 3 transactions in 5 minutes, enrich with account lookup, and send high-risk alerts to webhook while writing all events to Delta."

### Example request

```json
{
  "prompt": "Build a real-time fraud detection pipeline. Read from Kafka topic card_txn, detect if the same card has more than 3 transactions in 5 minutes, enrich with account lookup, and send high-risk alerts to webhook while writing all events to Delta."
}
```

### Example response shape (illustrative)

```json
{
  "name": "Fraud Detection Pipeline",
  "description": "Kafka -> count threshold + enrichment -> alerts + Delta sink",
  "nodes": [
    {
      "id": "kafka-source-1",
      "type": "kafka-topic",
      "x": 120,
      "y": 180,
      "label": "Card Txn Source",
      "config": {
        "topics": "card_txn",
        "bootstrapServers": "broker:9092"
      }
    },
    {
      "id": "pattern-1",
      "type": "count-threshold",
      "x": 420,
      "y": 180,
      "label": "3 in 5 Minutes",
      "config": {
        "eventFilter": "event_type = 'txn'",
        "thresholdCount": 3,
        "windowDuration": { "value": 5, "unit": "minutes" }
      }
    }
  ],
  "edges": [
    { "source": "kafka-source-1", "target": "pattern-1" }
  ]
}
```

### When to use it

Use AI Pipeline Generation when:

- you are starting from a blank canvas,
- you need a fast draft from a business requirement,
- you want to explore multiple topology options quickly.

### Limitations

- It is intentionally broad and may not perfectly tune CEP details.
- You should still validate:
  - pattern expressions,
  - window/time settings,
  - sink routing and operational behavior.

---

## 2) NL Pattern Generation (Single CEP Node)

### What it does

Given a targeted CEP intent, this endpoint generates one pattern suggestion:

- `node_type` (for example `count-threshold`, `sequence-detector`)
- `label`
- `config` (sanitized and normalized)
- reasoning/warnings/fallback metadata

### Endpoint

- `POST /api/pattern/nl-generate`

### Example prompt

> "Alert when login attempts exceed 5 in 1 minute."

### Example request

```json
{
  "prompt": "Alert when login attempts exceed 5 in 1 minute.",
  "preferred_model": "sonnet"
}
```

### Example response

```json
{
  "suggestion": {
    "node_type": "count-threshold",
    "label": "Count Threshold",
    "config": {
      "eventFilter": "event_type = 'login_attempt'",
      "thresholdCount": 5,
      "windowDuration": { "value": 1, "unit": "minutes" }
    },
    "reasoning": "Count-based anomaly over short window is best represented by count-threshold.",
    "model_used": "your-sonnet-endpoint"
  },
  "warnings": [],
  "fallback_used": false
}
```

### Supported pattern node types (current scoped support)

- `sequence-detector`
- `absence-detector`
- `count-threshold`
- `velocity-detector`
- `temporal-correlation`

### Hardening behavior

NL Pattern Generation includes safety controls:

- model selection validation (`sonnet` or `opus`)
- config key filtering by node type
- expression sanitization
- numeric and duration normalization/clamping
- audit logging for generation attempts
- deterministic fallback when model output is unavailable/unparseable

### When to use it

Use NL Pattern Generation when:

- you already have a pipeline and need to add/tune one pattern,
- you need tighter CEP-specific control,
- you want safer, normalized config output for production review.

---

## Typical End-to-End Workflow (Recommended)

1. Use **AI Pipeline Generation** to scaffold the full flow.  
2. Open generated pipeline in canvas and review topology.  
3. Use **NL Pattern Generation** to refine each CEP node.  
4. Run **Pattern Test** with sample events.  
5. Inspect explainability output and persisted history.  
6. Deploy after validation.

---

## Practical Examples

### Example A: Manufacturing anomaly pipeline

**Step 1 (AI Pipeline Generation prompt):**

> "Create an IoT pipeline for vibration sensors: source from Kafka, detect spikes in vibration events, correlate with temperature alerts within 2 minutes, and send PagerDuty alerts."

**Expected result:**

- full draft pipeline with source, pattern/transforms, and sink nodes

**Step 2 (NL Pattern Generation prompt for one node):**

> "Detect when vibration reading events exceed 20 events per minute."

**Expected result:**

- `velocity-detector` node suggestion with normalized rate config

---

### Example B: Missing heartbeat detection

**Prompt:**

> "Trigger alert if heartbeat from a device is missing for 10 minutes."

**Likely suggestion:**

- `absence-detector`
- `triggerEventFilter` and `expectedEventFilter` for heartbeat
- `timeoutDuration = 10 minutes`

---

### Example C: Temporal fraud correlation

**Prompt:**

> "Correlate login from new country with high-value transfer within 3 minutes for same account."

**Likely suggestion:**

- `temporal-correlation`
- stream A/B filters for login and transfer
- correlation key like `account_id`
- `maxTimeGap = 3 minutes`

---

## Explainability and History (Related Capability)

Pattern testing includes explainability fields and persisted run history:

- matched event payloads
- trigger timeline
- state snapshot
- run persistence and retrieval via history APIs

Related endpoints:

- `POST /api/pattern/test`
- `GET /api/pattern/history`
- `GET /api/pattern/history/{run_id}`

---

## Environment Configuration Notes

For NL Pattern Generation with Databricks model serving:

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_LLM_SONNET_ENDPOINT`
- `DATABRICKS_LLM_OPUS_ENDPOINT`
- `DATABRICKS_LLM_ENDPOINT` (optional fallback)

If model endpoint config is missing, the API falls back to deterministic heuristic generation.

---

## FAQ

### Is NL Pattern Generation replacing AI Pipeline Generation?

No. It complements it.

- AI Pipeline Generation: broad draft creation
- NL Pattern Generation: fine-grained CEP tuning

### Why not use one endpoint for both?

Because the reliability and safety requirements differ:

- full graph synthesis is exploratory,
- CEP pattern config needs stricter normalization and guardrails.

### Which one should I call first?

Usually:

1) `/api/ai/generate` first, then  
2) `/api/pattern/nl-generate` for targeted refinement.

