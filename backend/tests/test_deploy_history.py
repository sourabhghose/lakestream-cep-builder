"""Tests for deploy history service using LocalFileDeployStore."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.deploy_history import (
    DeployRecord,
    LocalFileDeployStore,
    get_deploy,
    get_latest_deploy,
    list_deploys,
    record_deploy,
)


@pytest.fixture
def deploy_store_dir(tmp_path: Path) -> Path:
    """Create a temporary directory for deploy history."""
    store_dir = tmp_path / "deploy_history"
    store_dir.mkdir(parents=True)
    return store_dir


@pytest.fixture
def deploy_store(deploy_store_dir: Path) -> LocalFileDeployStore:
    """Create a LocalFileDeployStore backed by a temporary directory."""
    return LocalFileDeployStore(base_dir=deploy_store_dir)


@pytest.fixture(autouse=True)
def use_local_deploy_store(deploy_store: LocalFileDeployStore, monkeypatch):
    """Patch deploy_history to use our temp store when PGHOST is not set."""
    monkeypatch.delenv("PGHOST", raising=False)

    def _get_store(base_dir=None):
        return deploy_store

    monkeypatch.setattr(
        "app.services.deploy_history._get_local_store",
        _get_store,
    )


def test_record_deploy_and_list_deploys(deploy_store: LocalFileDeployStore):
    """Test record_deploy() and list_deploys() using LocalFileStore fallback."""
    pipeline_id = "test-pipeline-123"
    record_deploy(
        pipeline_id=pipeline_id,
        version=1,
        code_target="sdp",
        job_id="job-456",
        job_url="https://example.com/jobs/456",
        status="success",
        code="print('hello')",
        deployed_by="user@example.com",
    )
    records = list_deploys(pipeline_id)
    assert len(records) == 1
    assert records[0].pipeline_id == pipeline_id
    assert records[0].pipeline_version == 1
    assert records[0].code_target == "sdp"
    assert records[0].databricks_job_id == "job-456"
    assert records[0].deploy_status == "success"
    assert records[0].deployed_code == "print('hello')"
    assert records[0].deployed_by == "user@example.com"


def test_deploy_records_reverse_chronological_order(deploy_store: LocalFileDeployStore):
    """Test that deploy records are returned in reverse chronological order."""
    pipeline_id = "pipeline-abc"
    record_deploy(
        pipeline_id=pipeline_id,
        version=1,
        code_target="sdp",
        job_id="job-1",
        job_url="https://example.com/1",
        status="success",
    )
    record_deploy(
        pipeline_id=pipeline_id,
        version=2,
        code_target="sdp",
        job_id="job-2",
        job_url="https://example.com/2",
        status="success",
    )
    record_deploy(
        pipeline_id=pipeline_id,
        version=3,
        code_target="sdp",
        job_id="job-3",
        job_url="https://example.com/3",
        status="success",
    )
    records = list_deploys(pipeline_id)
    assert len(records) == 3
    # Most recent first (version 3, then 2, then 1)
    assert records[0].pipeline_version == 3
    assert records[1].pipeline_version == 2
    assert records[2].pipeline_version == 1


def test_get_latest_deploy(deploy_store: LocalFileDeployStore):
    """Test that get_latest_deploy() returns the most recent deploy."""
    pipeline_id = "pipeline-xyz"
    record_deploy(
        pipeline_id=pipeline_id,
        version=1,
        code_target="sss",
        job_id="job-old",
        job_url="https://example.com/old",
        status="success",
    )
    record_deploy(
        pipeline_id=pipeline_id,
        version=2,
        code_target="sss",
        job_id="job-new",
        job_url="https://example.com/new",
        status="success",
    )
    latest = get_latest_deploy(pipeline_id)
    assert latest is not None
    assert latest.pipeline_version == 2
    assert latest.databricks_job_id == "job-new"


def test_get_latest_deploy_empty(deploy_store: LocalFileDeployStore):
    """Test get_latest_deploy returns None when no deploys exist."""
    latest = get_latest_deploy("nonexistent-pipeline")
    assert latest is None


def test_get_deploy_by_id(deploy_store: LocalFileDeployStore):
    """Test get_deploy retrieves a record by ID."""
    pipeline_id = "pipeline-for-get"
    record_deploy(
        pipeline_id=pipeline_id,
        version=1,
        code_target="sdp",
        job_id="job-789",
        job_url="https://example.com/789",
        status="success",
    )
    records = list_deploys(pipeline_id)
    deploy_id = records[0].id
    found = get_deploy(deploy_id)
    assert found is not None
    assert found.id == deploy_id
    assert found.pipeline_id == pipeline_id
