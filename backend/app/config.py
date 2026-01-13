from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from typing import List


def parse_email_list(value: str | None) -> List[str]:
    """Parse comma-separated email string into list, trimming whitespace and filtering empty."""
    if value is None or value == "":
        return []
    return [e.strip().lower() for e in value.split(",") if e and e.strip()]


class Settings(BaseSettings):
    project_id: str = "genmediastudio"
    location: str = "us-central1"
    veo_location: str = "us-central1"  # Veo API only available in us-central1
    gcs_bucket: str = "genmediastudio-assets"
    workflows_bucket: str = "genmediastudio-workflows"
    firebase_project_id: str = "genmediastudio"

    # Email allowlists - stored as comma-separated strings from env
    # Format: ALLOWED_EMAILS=email1@example.com,email2@example.com
    _allowed_emails_raw: str = ""
    _admin_emails_raw: str = ""

    # Firebase config (for testing)
    firebase_api_key: str = ""
    firebase_service_account_key: str = "serviceAccountKey.json"

    # Model names
    gemini_image_model: str = "gemini-2.5-flash-image"  # GA model available in us-central1
    gemini_text_model: str = "gemini-3-flash-preview"  # Latest Gemini 3 model
    veo_model: str = "veo-3.1-generate-preview"
    upscale_model: str = "imagen-4.0-upscale-preview"

    @property
    def ALLOWED_EMAILS(self) -> List[str]:
        """List of allowed emails parsed from comma-separated string."""
        return parse_email_list(self._allowed_emails_raw)

    @property
    def ADMIN_EMAILS(self) -> List[str]:
        """List of admin emails parsed from comma-separated string."""
        return parse_email_list(self._admin_emails_raw)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Map env var names to internal fields
        env_prefix="",
    )

    def model_post_init(self, __context):
        """Load email lists from environment after init."""
        import os
        # Read directly from env since pydantic-settings doesn't handle uppercase well
        allowed = os.getenv("ALLOWED_EMAILS", "")
        admin = os.getenv("ADMIN_EMAILS", "")
        object.__setattr__(self, "_allowed_emails_raw", allowed)
        object.__setattr__(self, "_admin_emails_raw", admin)


settings = Settings()
