"""Runtime configuration. Loaded once from .env / environment."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
AUDIT_DIR = DATA_DIR / "audit"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    anthropic_api_key: str = ""
    aetheric_model: str = "claude-opus-4-7"

    # Sponsors
    tavily_api_key: str = ""
    thrad_api_key: str = ""
    thrad_api_url: str = ""
    overmind_api_key: str = ""

    # App
    app_env: str = "dev"
    log_level: str = "INFO"
    approval_timeout_seconds: int = 120
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    def ensure_dirs(self) -> None:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
