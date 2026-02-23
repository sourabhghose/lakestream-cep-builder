"""
Application configuration.

DatabricksConfig reads from environment variables with sensible defaults
for local development.
"""

import os

from pydantic import BaseModel, Field


class DatabricksConfig(BaseModel):
    """
    Databricks connection configuration.

    Reads from environment variables. Auto-discovers credentials from
    DATABRICKS_HOST, DATABRICKS_TOKEN, or Databricks Apps context.
    """

    host: str | None = Field(default=None)
    token: str | None = Field(default=None)
    workspace_path_prefix: str = Field(default="LakeStream-CEP")

    @classmethod
    def from_env(cls) -> "DatabricksConfig":
        return cls(
            host=os.environ.get("DATABRICKS_HOST"),
            token=os.environ.get("DATABRICKS_TOKEN"),
            workspace_path_prefix=os.environ.get(
                "DATABRICKS_WORKSPACE_PATH_PREFIX", "LakeStream-CEP"
            ),
        )

    @property
    def is_configured(self) -> bool:
        """True if Databricks host is set (real deployment mode)."""
        return bool(self.host and self.host.strip())
