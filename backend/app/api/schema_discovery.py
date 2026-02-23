"""
Schema discovery API for Unity Catalog.

Provides endpoints to browse catalogs, schemas, tables, and columns.
Used by the frontend to populate source/sink node configs.
"""

from fastapi import APIRouter

from app.services.deploy_service import DeployService

router = APIRouter()
deploy_service = DeployService()


@router.get("/catalogs")
async def list_catalogs() -> list[dict[str, str]]:
    """
    List Unity Catalog catalogs available to the user.

    Delegates to deploy_service. Returns empty list when not connected.
    """
    return deploy_service.list_catalogs()


@router.get("/catalogs/{catalog}/schemas")
async def list_schemas(catalog: str) -> list[dict[str, str]]:
    """
    List schemas in a Unity Catalog catalog.

    Returns empty list when not connected.
    """
    return deploy_service.list_schemas(catalog)


@router.get("/catalogs/{catalog}/schemas/{schema}/tables")
async def list_tables(catalog: str, schema: str) -> list[dict]:
    """
    List tables in a Unity Catalog schema.

    Uses w.tables.list(catalog_name, schema_name) from Databricks SDK.
    Returns [{name, table_type, columns}, ...].
    Returns empty list when not connected.
    """
    return deploy_service.list_tables(catalog, schema)


@router.get("/catalogs/{catalog}/schemas/{schema}/tables/{table}/columns")
async def list_columns(catalog: str, schema: str, table: str) -> list[dict]:
    """
    List columns for a Unity Catalog table.

    Uses w.tables.get(catalog.schema.table) from Databricks SDK.
    Returns [{name, type, nullable}, ...].
    When not connected: returns mock sample data.
    """
    return deploy_service.list_columns(catalog, schema, table)
