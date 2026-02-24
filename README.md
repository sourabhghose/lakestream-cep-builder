# LakeStream CEP Builder

**Visual Complex Event Processing Pipeline Builder for Databricks**

[![CI](https://github.com/sourabhghose/lakestream-cep-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/sourabhghose/lakestream-cep-builder/actions/workflows/ci.yml)
[![Deploy](https://github.com/sourabhghose/lakestream-cep-builder/actions/workflows/deploy.yml/badge.svg)](https://github.com/sourabhghose/lakestream-cep-builder/actions/workflows/deploy.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Databricks](https://img.shields.io/badge/Databricks_App-Lakeflow-FF3621)]()
[![Lakebase](https://img.shields.io/badge/Database-Lakebase_PostgreSQL-336791)]()
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue)]()
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)]()

---

## What Is This?

LakeStream CEP Builder is a **Databricks App** that lets you design Complex Event Processing pipelines visually using drag-and-drop, then deploy them to Databricks with one click. You compose streaming pipelines from **41 node types** — sources, CEP patterns, transforms, and sinks — and the backend generates production-ready code for **Lakeflow Declarative Pipelines (SDP)** or **Spark Structured Streaming + TransformWithState**.

No other tool on Databricks provides visual CEP capabilities. Lakeflow Designer is batch-first with no pattern matching. This tool fills that gap.

---

## Architecture

Deployed as a **Databricks App** — a single FastAPI process serves the React frontend and REST API. All state is stored in **Lakebase** (Databricks' serverless PostgreSQL).

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Databricks App                               │
│                                                                     │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐ │
│  │   React Frontend     │    │       FastAPI Backend              │ │
│  │                      │    │                                    │ │
│  │  React Flow Canvas   │───▶│  /api/pipelines     (CRUD)        │ │
│  │  41-Node Palette     │    │  /api/codegen       (SDP + SSS)   │ │
│  │  Monaco Editor       │    │  /api/deploy        (SDK)         │ │
│  │  Schema Browser      │    │  /api/schema        (UC discovery)│ │
│  │  Pattern Timeline    │    │  /api/preview       (sample data) │ │
│  │  Template Gallery    │    │  /api/codeparse     (code→canvas) │ │
│  └──────────────────────┘    └──────────┬─────────────────────────┘ │
│        Static files at /                │                           │
│        API at /api/*                    │                           │
└─────────────────────────────────────────┼───────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
            │   Lakebase    │   │  Lakeflow Jobs  │   │ Unity Catalog │
            │  PostgreSQL   │   │  DLT Pipelines  │   │    Schemas    │
            │               │   │  SSS Jobs       │   │    Tables     │
            │  pipelines    │   └─────────────────┘   └───────────────┘
            │  deploy_hist  │
            │  user_prefs   │
            │  templates    │
            └───────────────┘
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **41 Node Types** | 9 sources, 12 CEP patterns, 11 transforms, 9 sinks |
| **Dual Code Generation** | Lakeflow Declarative Pipelines (SDP) + Spark Structured Streaming |
| **12 CEP Patterns** | Sequence, absence, count, velocity, geofence, correlation, trend, outlier, session, dedup, MATCH_RECOGNIZE, custom |
| **TransformWithState** | Spark 4.0 stateful processing for advanced CEP patterns |
| **Pattern Test Mode** | Upload sample events, simulate CEP matching, see results + event flow |
| **Monaco Editor** | Bidirectional sync, diff view vs last deploy, line-level code annotations |
| **Schema Discovery** | Browse Unity Catalog catalogs/schemas/tables with cascading dropdowns |
| **Data Preview** | Per-node synthetic preview + flow-through source-to-sink simulation |
| **Live Auto-Refresh** | Preview data auto-refreshes every 3 seconds with consistent seeding across connected nodes |
| **Inline Node Preview** | Expandable data tables directly on canvas nodes |
| **Pattern Timeline** | SVG visualization of event sequences in design and test modes |
| **11 Templates** | Pre-built pipelines (incl. Trucking IoT Analytics) + save your own |
| **Deploy Dialog** | Full config: compute, schedule, checkpoint, connection validation |
| **Job Notifications** | Real-time polling of deployed job status with badges |
| **Deploy History** | Audit trail with status, code view, and Databricks links |
| **Pipeline Management** | Save, load, version, delete, export/import as JSON |
| **Version Diff** | Side-by-side comparison of pipeline versions |
| **Stream Simulator** | Built-in streaming source simulator for testing without real infrastructure |
| **ML Model Endpoint** | Connect to Databricks ML serving endpoints for real-time predictions |
| **Union / Merge Node** | Combine up to 8 streams (union-all or union-distinct) |
| **Single-Input Enforcement** | Transform/sink nodes enforce single input; Union node for multi-stream |
| **Validation Panel** | 12+ pre-deploy checks with clickable fix navigation |
| **Node Grouping** | Collapse multiple nodes into subgraphs |
| **Pipeline Search** | Ctrl+F with node highlighting and auto-pan |
| **Copy/Paste** | Ctrl+C/V/D/A with clipboard and ID remapping |
| **Databricks Dark Theme** | Always-on dark UI matching Databricks look and feel |
| **Lakebase Storage** | All state persisted in Databricks' serverless PostgreSQL |
| **OAuth Identity** | User identity from Databricks App service principal |
| **Undo/Redo** | 50-entry history stack with keyboard shortcuts |
| **Auto Layout** | Topological sort layout algorithm |
| **Accessibility** | ARIA labels, keyboard navigation, skip links, focus rings |
| **Error Boundaries** | Graceful error handling with retry logic |
| **Help System** | Node tooltips, keyboard shortcuts, quick start guide |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (static export), React Flow v12, Monaco Editor, Zustand, Tailwind CSS, Radix UI |
| **Backend** | FastAPI, Jinja2 (51 templates), Databricks SDK, Pydantic v2, psycopg3 |
| **Database** | Lakebase PostgreSQL (Databricks App resource) — falls back to local files for dev |
| **Runtime** | Lakeflow Declarative Pipelines (SDP), Spark Structured Streaming + TransformWithState |
| **CI/CD** | GitHub Actions (backend tests, frontend build, linting, deploy) |
| **Tests** | pytest (37 backend tests), pytest-asyncio |

---

## Quick Start

### Option 1: Deploy as Databricks App (Production)

1. **Create a Databricks App** in your workspace
2. **Create a Lakebase database instance** (via UI or API):
   ```bash
   databricks api post /api/2.0/database/instances \
     --json '{"name":"lakestream-cep","capacity":"CU_1","pg_version":"PG_VERSION_16"}'
   ```
3. **Add the database as an App resource** (permission: "Can connect and create"):
   ```bash
   databricks api patch /api/2.0/apps/<app-name> \
     --json '{"resources":[{"name":"database","database":{"instance_name":"lakestream-cep","database_name":"postgres","permission":"CAN_CONNECT_AND_CREATE"}}]}'
   ```
4. **Deploy the code**:
   ```bash
   make build-app
   databricks bundle deploy
   databricks apps deploy <app-name> --source-code-path <bundle-path>
   ```
5. The app will be available at your Databricks App URL. Schema tables are auto-created on first startup.

### Option 2: Local Development

```bash
# Clone the repository
git clone https://github.com/sourabhghose/lakestream-cep-builder.git
cd lakestream-cep-builder

# Install dependencies
make install

# Start both frontend (port 3000) and backend (port 8000)
make dev
```

Or run the unified build (FastAPI serves everything on port 8000):

```bash
make build-app
cd backend && uvicorn app.main:app --port 8000
# Open http://localhost:8000
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
# Lakebase PostgreSQL (auto-injected by Databricks Apps)
PGHOST=                          # PostgreSQL host
PGUSER=                          # Service principal client ID
PGDATABASE=databricks_postgres   # Database name
PGPORT=5432
PGSSLMODE=require

# Databricks (auto-injected by Databricks Apps)
DATABRICKS_HOST=                 # Workspace URL
DATABRICKS_TOKEN=                # PAT or OAuth token

# Local development only
ENVIRONMENT=development
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Project Structure

```
lakestream-cep-builder/
├── frontend/                    # Next.js 14 React app (static export)
│   ├── src/
│   │   ├── app/                # Main page
│   │   ├── components/         # Canvas, nodes, panels, editors, schema browser
│   │   │   ├── canvas/         # PipelineCanvas, CustomNode, CustomEdge, NodePalette
│   │   │   ├── editors/        # CodePreview (Monaco)
│   │   │   ├── panels/         # ConfigPanel, HelpPanel, PipelineListPanel
│   │   │   ├── preview/        # DataPreview
│   │   │   ├── schema/         # SchemaBrowser
│   │   │   ├── timeline/       # PatternTimeline
│   │   │   ├── templates/      # TemplateGallery
│   │   │   ├── dialogs/        # SaveDialog
│   │   │   └── ui/             # Toast
│   │   ├── hooks/              # usePipelineStore, useToastStore, useKeyboardShortcuts
│   │   ├── lib/                # api, nodeRegistry (41 nodes), edgeValidator, autoLayout, templates (11)
│   │   └── types/              # nodes.ts, pipeline.ts
│   └── package.json
├── backend/                     # FastAPI backend
│   ├── app/
│   │   ├── api/                # pipelines, codegen, codeparse, deploy, schema_discovery, preview
│   │   ├── codegen/            # SDP generator, SSS generator, router, graph_utils
│   │   ├── models/             # Pydantic models
│   │   ├── services/           # deploy_service, pipeline_store, deploy_history
│   │   ├── config.py           # DatabricksConfig
│   │   ├── db.py               # Lakebase PostgreSQL connection pool
│   │   ├── db_schema.sql       # Database DDL
│   │   └── main.py             # FastAPI app + static file serving
│   ├── templates/              # Jinja2 code gen templates
│   │   ├── sdp/                # 22 SDP SQL templates
│   │   └── sss/                # 29 SSS PySpark templates
│   ├── tests/                  # 37 pytest tests
│   └── requirements.txt
├── .github/workflows/           # CI + Deploy workflows
├── docs/ARCHITECTURE.md
├── app.yaml                     # Databricks App config
├── databricks.yml               # Asset Bundle config
├── Makefile
└── README.md
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `make install` | Install frontend + backend dependencies |
| `make dev` | Run frontend (port 3000) + backend (port 8000) for local dev |
| `make dev-backend` | Run FastAPI backend only with hot reload |
| `make dev-frontend` | Run Next.js dev server only |
| `make build-frontend` | Build static frontend to `frontend/out/` |
| `make build-app` | Build frontend + prepare for Databricks App deployment |
| `make test` | Run all backend tests |
| `make lint` | Run linting (frontend + backend) |
| `make deploy` | Deploy to Databricks Apps |
| `make clean` | Remove build artifacts |

---

## CEP Pattern Reference

| Pattern | Description | Implementation |
|---------|-------------|----------------|
| **Sequence Detector** | Ordered events (A → B → C) with contiguity modes | TransformWithState |
| **Absence Detector** | Expected event missing within time window | TransformWithState + timers |
| **Count Threshold** | Event count exceeds N in a window | Windowed aggregation |
| **Velocity Detector** | Rate anomalies (events/sec) | Sliding window + threshold |
| **Geofence / Location** | Spatial events (enter/exit/dwell) | TransformWithState + geometry |
| **Temporal Correlation** | Events from two streams within time window | TransformWithState |
| **Trend Detector** | Monotonic increase/decrease detection | TransformWithState |
| **Outlier / Anomaly** | Statistical deviation (Z-score, IQR, MAD) | TransformWithState + stats |
| **Session Detector** | Group events by inactivity gap | Session windows |
| **Deduplication** | Exactly-once by key within watermark | dropDuplicatesWithinWatermark |
| **MATCH_RECOGNIZE SQL** | SQL pattern matching (ISO standard) | Native Spark SQL |
| **Custom StatefulProcessor** | User-written TransformWithState Python | Direct code |

---

## Database Schema (Lakebase)

| Table | Purpose |
|-------|---------|
| `pipelines` | Pipeline definitions — canvas JSON, generated code, version, status |
| `deploy_history` | Deployment audit trail — job IDs, status, timestamps, errors |
| `user_preferences` | Per-user settings — default catalog/schema, canvas preferences |
| `saved_templates` | Built-in (11) + user-created pipeline templates |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pipelines` | GET, POST | List/create pipelines |
| `/api/pipelines/{id}` | GET, PUT, DELETE | Get/update/delete pipeline |
| `/api/pipelines/{id}/versions` | GET | List pipeline version snapshots |
| `/api/codegen/generate` | POST | Generate SDP/SSS code with annotations |
| `/api/codeparse/parse` | POST | Parse SDP SQL back to canvas nodes |
| `/api/deploy` | POST | Deploy pipeline to Databricks |
| `/api/deploy/validate` | GET | Check Databricks connection status |
| `/api/deploy/catalogs` | GET | List Unity Catalog catalogs |
| `/api/deploy/history/{id}` | GET | Get deploy history for pipeline |
| `/api/deploy/history/{id}/details` | GET | Full deploy history with code |
| `/api/schema/catalogs` | GET | Browse catalogs |
| `/api/schema/.../tables` | GET | Browse tables in a schema |
| `/api/schema/.../columns` | GET | Get column definitions |
| `/api/preview/sample` | POST | Get synthetic data preview for a node |
| `/api/preview/flow` | POST | Flow-through preview (source to sink) |
| `/api/pattern/test` | POST | Test CEP patterns against sample events |
| `/api/templates` | GET, POST | List/create pipeline templates |
| `/api/templates/{id}` | DELETE | Delete user template |
| `/api/preferences` | GET, PUT | Get/update user preferences |
| `/api/jobs/{id}/status` | GET | Get deployed job status |
| `/api/jobs/active` | GET | List active/running jobs |
| `/health` | GET | Health check |

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Contributing

Contributions welcome. Please open an issue or submit a pull request. Ensure `make test` and `make lint` pass before submitting.
