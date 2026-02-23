"""
Application configuration.

DatabricksConfig reads from environment variables with sensible defaults
for local development.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabricksConfig(BaseSettings):
    """
    Databricks connection configuration.

    Reads from environment variables. Auto-discovers credentials from
    DATABRICKS_HOST, DATABRICKS_TOKEN, or Databricks Apps context.
    """

    model_config = SettingsConfigDict(
        env_prefix="DATABRICKS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str | None = Field(
        default=None,
        description="Databricks workspace URL (e.g. https://xxx.cloud.databricks.com)",
    )
    token: str | None = Field(
        default=None,
        description="Databricks personal access token or OAuth token",
    )
    workspace_path_prefix: str = Field(
        default="LakeStream-CEP",
        description="Workspace folder prefix for deployed notebooks",
    )

    @property
    def is_configured(self) -> bool:
        """True if Databricks host is set (real deployment mode)."""
        return bool(self.host and self.host.strip())
