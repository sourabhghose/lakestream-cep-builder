# LakeStream CEP Builder — Architecture

## Deployment Model

LakeStream CEP Builder is deployed as a **Databricks App** — a managed application running inside the Databricks workspace. The app consists of a single FastAPI process that serves both the React frontend (static files) and the REST API.

```
┌────────────────────────────── Databricks App ──────────────────────────────┐
│                                                                            │
│  app.yaml: uvicorn app.main:app --host 0.0.0.0 --port 8000               │
│                                                                            │
│  ┌─────────────────────┐         ┌──────────────────────────────────────┐ │
│  │  Static Frontend    │         │  FastAPI Backend                     │ │
│  │  (frontend/out/)    │         │                                      │ │
│  │                     │         │  /api/pipelines    → pipeline_store  │ │
│  │  Served at /        │         │  /api/codegen      → sdp/sss gen    │ │
│  │  /_next/* assets    │         │  /api/deploy       → Databricks SDK │ │
│  │                     │         │  /api/schema       → Unity Catalog  │ │
│  │  SPA fallback:      │         │  /api/preview      → sample data    │ │
│  │  index.html for     │         │  /api/codeparse    → SQL parser     │ │
│  │  client-side routes │         │                                      │ │
│  └─────────────────────┘         └──────────┬───────────────────────────┘ │
│                                              │                            │
└──────────────────────────────────────────────┼────────────────────────────┘
                                               │
          ┌────────────────────────────────────┼────────────────────────────┐
          │                                    │                            │
  ┌───────▼────────┐  ┌────────────────┐  ┌───▼──────────┐  ┌───────────┐ │
  │   Lakebase     │  │ Lakeflow Jobs  │  │Unity Catalog │  │ Streaming │ │
  │   PostgreSQL   │  │ DLT Pipelines  │  │  Schemas     │  │  Sources  │ │
  │                │  │ SSS Jobs       │  │  Tables      │  │  Kafka    │ │
  │   4 tables     │  │ Notebooks      │  │  Columns     │  │  S3/ADLS  │ │
  └────────────────┘  └────────────────┘  └──────────────┘  └───────────┘ │
          │                                                                │
          └────────────────────────────────────────────────────────────────┘
```

### How Databricks App Hosting Works

1. `app.yaml` specifies the command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
2. Databricks creates a **service principal** for the app with OAuth credentials
3. The app is accessible at `https://<workspace>.databricks.com/apps/<app-name>`
4. Routes under `/api/*` are protected by Databricks OAuth (bearer token)
5. The service principal can call Databricks APIs (jobs, pipelines, Unity Catalog)

### Lakebase Integration

Lakebase is added as a **Databricks App resource** (type: database). This:
- Creates a PostgreSQL role matching the service principal's client ID
- Grants `CONNECT` + `CREATE` on the selected database
- Auto-injects environment variables: `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPORT`, `PGSSLMODE`

The backend connects via `psycopg3` (PostgreSQL 3.x driver):

```python
from psycopg_pool import ConnectionPool

conninfo = f"host={PGHOST} port={PGPORT} dbname={PGDATABASE} user={PGUSER} sslmode={PGSSLMODE}"
pool = ConnectionPool(conninfo, min_size=2, max_size=10)
```

---

## Database Schema

Four tables in Lakebase PostgreSQL:

### pipelines
Core entity storing pipeline definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| name | VARCHAR(255) | Pipeline name |
| description | TEXT | Optional description |
| canvas_json | JSONB | React Flow nodes + edges + positions |
| code_target | VARCHAR(20) | sdp, sss, or hybrid |
| generated_sdp_code | TEXT | Last generated SDP code |
| generated_sss_code | TEXT | Last generated SSS code |
| version | INT | Incremented on each update |
| status | VARCHAR(20) | draft, deployed, paused, archived |
| created_by | VARCHAR(255) | User identity |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update |
| tags | JSONB | Key-value metadata |

### deploy_history
Audit trail for all deployments.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| pipeline_id | UUID (FK) | References pipelines |
| pipeline_version | INT | Pipeline version at deploy time |
| code_target | VARCHAR(20) | sdp or sss |
| databricks_job_id | VARCHAR(255) | Job ID from Databricks |
| databricks_pipeline_id | VARCHAR(255) | DLT pipeline ID |
| job_url | TEXT | Direct URL to the job/pipeline |
| deploy_status | VARCHAR(20) | pending, success, failed |
| deployed_code | TEXT | Exact code deployed |
| cluster_config | JSONB | Compute configuration |
| deployed_by | VARCHAR(255) | User who deployed |
| deployed_at | TIMESTAMPTZ | Deploy timestamp |
| error_message | TEXT | Error if failed |

### user_preferences
Per-user settings.

| Column | Type | Description |
|--------|------|-------------|
| user_id | VARCHAR(255) (PK) | Databricks user identity |
| default_catalog | VARCHAR(255) | Preferred Unity Catalog catalog |
| default_schema | VARCHAR(255) | Preferred schema |
| canvas_settings | JSONB | Layout, theme preferences |
| recent_pipelines | UUID[] | Last accessed pipeline IDs |
| updated_at | TIMESTAMPTZ | Last update |

### saved_templates
Built-in (10 pre-loaded) and user-created templates.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| name | VARCHAR(255) | Template name |
| description | TEXT | What the template does |
| industry | VARCHAR(100) | FinServ, E-commerce, IoT, etc. |
| canvas_json | JSONB | Pre-configured pipeline |
| is_builtin | BOOLEAN | True for the 10 default templates |
| created_by | VARCHAR(255) | User who created it |
| created_at | TIMESTAMPTZ | Creation timestamp |

---

## Code Generation Strategy

The code generation router analyzes the pipeline graph and selects the target:

```
Pipeline Definition
       │
       ▼
  Analyze All Nodes
       │
       ├─ Any CEP pattern node? ──▶ SSS path (TransformWithState)
       │
       ├─ All SDP-compatible? ────▶ SDP path (Declarative Pipelines)
       │
       └─ Mix of both? ──────────▶ Hybrid (SDP + SSS, multi-task Job)
```

### SDP Path (Lakeflow Declarative Pipelines)

- 22 Jinja2 SQL templates in `backend/templates/sdp/`
- Generates `CREATE OR REFRESH STREAMING TABLE` statements
- Output: Databricks notebook with SDP SQL cells

### SSS Path (Spark Structured Streaming)

- 29 Jinja2 Python templates in `backend/templates/sss/`
- CEP patterns use `TransformWithState` (Spark 4.0)
- Each CEP pattern compiles to a `StatefulProcessor` subclass
- Output: PySpark notebook with streaming dataframe operations

### Hybrid Path

When a pipeline contains both standard nodes (filter, join) and CEP patterns:
- Standard subgraph → SDP code
- CEP subgraph → SSS code
- Deployed as a multi-task Lakeflow Job

---

## Frontend Architecture

### React Flow Canvas

The canvas uses React Flow v12 with:
- **Custom nodes** (`CustomNode.tsx`): Color-coded by category, memoized with custom comparator
- **Custom edges** (`CustomEdge.tsx`): Animated, red dashed style for invalid connections
- **MiniMap**: Category-colored (green=source, blue=transform, purple=CEP, orange=sink)
- **Controls**: Zoom in/out/fit
- **Background**: Dots pattern

### State Management (Zustand)

Single store (`usePipelineStore`) manages:
- Nodes and edges (React Flow state)
- Pipeline metadata (name, ID, version, dirty flag)
- Undo/redo stacks (50 entries max)
- Code generation triggers
- Save/deploy actions

### Key Frontend Components

| Component | Purpose |
|-----------|---------|
| `PipelineCanvas` | React Flow wrapper with drag-drop, edge validation |
| `NodePalette` | Searchable, collapsible node catalog (38 nodes in 4 categories) |
| `CustomNode` | Memoized node rendering with error states and preview |
| `ConfigPanel` | Dynamic form generation from node registry |
| `DynamicConfigForm` | Schema-aware dropdowns for catalog/schema/table fields |
| `CodePreview` | Monaco editor with edit mode and bidirectional sync |
| `SchemaBrowser` | Unity Catalog tree browser |
| `DataPreview` | Sample data table at each node |
| `PatternTimeline` | SVG timeline for CEP pattern visualization |
| `TemplateGallery` | Pre-built pipeline templates |
| `SaveDialog` | Create/update pipeline dialog |
| `PipelineListPanel` | List, load, delete pipelines |
| `HelpPanel` | Quick start, shortcuts, node category docs |
| `Toast` | Notification system (success/error/warning/info) |

---

## Backend Architecture

### API Routers

| Router | Prefix | Endpoints |
|--------|--------|-----------|
| `pipelines` | `/api/pipelines` | CRUD for pipeline definitions |
| `codegen` | `/api/codegen` | Code generation (SDP/SSS) |
| `codeparse` | `/api/codeparse` | Parse SDP SQL → canvas nodes |
| `deploy` | `/api/deploy` | Deploy to Databricks, validate, catalogs, history |
| `schema_discovery` | `/api/schema` | Unity Catalog browsing |
| `preview` | `/api/preview` | Synthetic data preview |

### Services

| Service | Responsibility |
|---------|---------------|
| `pipeline_store` | Pipeline persistence (LakebaseStore or LocalFileStore) |
| `deploy_service` | Databricks SDK integration (notebooks, jobs, DLT pipelines) |
| `deploy_history` | Deployment audit trail in Lakebase |

### Code Generation Pipeline

```
PipelineDefinition (JSON)
       │
       ▼
  graph_utils.topological_sort()
       │
       ▼
  router.generate()
       │
       ├─▶ sdp_generator.generate_sdp()
       │       │
       │       └── For each node: render Jinja2 template (sdp/*.sql.j2)
       │
       └─▶ sss_generator.generate_sss()
               │
               └── For each node: render Jinja2 template (sss/*.py.j2)
       │
       ▼
  CodeGenResult { sdp_code, sss_code, code_target, warnings }
```

---

## Security Model

### In Databricks App

- **OAuth**: Databricks Apps framework handles authentication
- **Service Principal**: App gets a service principal with scoped permissions
- **Lakebase**: Service principal has `CONNECT` + `CREATE` on the database
- **Unity Catalog**: Permissions inherited from the service principal
- **CORS**: Not needed (same origin — frontend and API on same port)

### Local Development

- **No OAuth**: Direct access on localhost
- **LocalFileStore**: Pipelines stored as JSON files in `~/.lakestream/pipelines/`
- **Mock deploy**: Returns fake job IDs when `DATABRICKS_HOST` is not set
- **CORS**: Allowed from `localhost:3000` when `ENVIRONMENT=development`

---

## Local Development Fallbacks

| Component | Production (Databricks App) | Local Development |
|-----------|---------------------------|-------------------|
| Database | Lakebase PostgreSQL | LocalFileStore (JSON files) |
| Deploy | Real Databricks SDK | Mock responses |
| Auth | Databricks OAuth | None (open access) |
| Frontend | Static files served by FastAPI | Next.js dev server (port 3000) |
| Schema | Unity Catalog API | Empty lists / mock data |

---

## Node Type System

Each of the 38 node types is defined in `NODE_REGISTRY` (`frontend/src/lib/nodeRegistry.ts`):

```typescript
interface NodeDefinition {
  type: NodeType;           // e.g., "sequence-detector"
  label: string;            // "Sequence Detector"
  description: string;      // Tooltip text
  category: NodeCategory;   // "source" | "cep-pattern" | "transform" | "sink"
  codeTarget: CodeTarget;   // "sdp" | "sss" | "sdp-or-sss"
  icon: string;             // Lucide icon name
  inputs: number;           // 0-2
  outputs: number;          // 0-1
  configFields: ConfigField[];    // Main configuration
  advancedFields?: ConfigField[]; // Advanced/optional settings
}
```

### Validation Rules

- Sources: 0 inputs, 1 output
- Sinks: 1 input, 0 outputs
- Transforms: 1-2 inputs, 1 output
- CEP patterns: 1-2 inputs, 1 output
- Graph must be a DAG (directed acyclic graph)
- Semantic edge validation prevents invalid connections (e.g., sink → sink)
