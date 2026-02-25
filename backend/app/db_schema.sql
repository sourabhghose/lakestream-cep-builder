CREATE TABLE IF NOT EXISTS pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    canvas_json JSONB NOT NULL,
    code_target VARCHAR(20) DEFAULT 'sdp',
    generated_sdp_code TEXT,
    generated_sss_code TEXT,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft',
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    tags JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS deploy_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
    pipeline_version INT NOT NULL,
    code_target VARCHAR(20) NOT NULL,
    databricks_job_id VARCHAR(255),
    databricks_pipeline_id VARCHAR(255),
    job_url TEXT,
    deploy_status VARCHAR(20) NOT NULL,
    deployed_code TEXT,
    cluster_config JSONB,
    deployed_by VARCHAR(255),
    deployed_at TIMESTAMPTZ DEFAULT now(),
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id VARCHAR(255) PRIMARY KEY,
    default_catalog VARCHAR(255),
    default_schema VARCHAR(255),
    canvas_settings JSONB DEFAULT '{}'::jsonb,
    recent_pipelines UUID[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    industry VARCHAR(100),
    canvas_json JSONB NOT NULL,
    is_builtin BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pattern_test_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id VARCHAR(255),
    total_events INT NOT NULL,
    total_matches INT NOT NULL,
    matches_json JSONB NOT NULL,
    event_flow_json JSONB NOT NULL,
    run_context JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_status ON pipelines(status);
CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON pipelines(created_by);
CREATE INDEX IF NOT EXISTS idx_deploy_history_pipeline ON deploy_history(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_templates_industry ON saved_templates(industry);
CREATE INDEX IF NOT EXISTS idx_pattern_test_pipeline ON pattern_test_history(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pattern_test_created_at ON pattern_test_history(created_at);
