# AI Generation vs NL Generation

This document clarifies the difference between the two natural-language capabilities in LakeStream CEP Builder.

## 1) AI Pipeline Generation

- **Endpoint:** `POST /api/ai/generate`
- **Primary purpose:** Create a **complete pipeline graph** from a high-level prompt.
- **Typical prompt style:**  
  "Build a fraud detection pipeline with Kafka source, velocity detector, and email alerts."
- **Output shape:** Full pipeline object:
  - pipeline name/description
  - multiple nodes
  - edges connecting nodes
- **Best used when:** Starting from a blank canvas or generating an initial end-to-end draft quickly.

## 2) NL Pattern Generation

- **Endpoint:** `POST /api/pattern/nl-generate`
- **Primary purpose:** Create **one CEP pattern node configuration** from a targeted intent.
- **Typical prompt style:**  
  "Alert when login attempts exceed 5 in 1 minute."
- **Output shape:** Single node suggestion:
  - `node_type`
  - `label`
  - sanitized `config`
  - reasoning/warnings/fallback metadata
- **Best used when:** Refining or adding a specific pattern inside an existing pipeline.

## How They Complement Each Other

- Use **AI Pipeline Generation** first to scaffold the whole flow.
- Use **NL Pattern Generation** next to tune pattern behavior node-by-node with stronger CEP-specific controls.

## Key Functional Difference

- **AI Pipeline Generation = broad graph synthesis**
- **NL Pattern Generation = targeted CEP node authoring**

Both are valuable, but they solve different levels of the authoring workflow.
