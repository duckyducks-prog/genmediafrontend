import pytest

def test_default_settings():
    """Settings load with defaults"""
    from app.config import Settings
    s = Settings()
    assert s.project_id == "genmediastudio"
    assert s.location == "us-central1"  # Default location for GCP

def test_env_override(monkeypatch):
    """Environment variables override defaults"""
    monkeypatch.setenv("PROJECT_ID", "test-project")
    from importlib import reload
    import app.config
    reload(app.config)
    from app.config import Settings
    s = Settings()
    assert s.project_id == "test-project"

def test_allowed_emails_default():
    """ALLOWED_EMAILS defaults to empty list when env var not set"""
    from app.config import Settings
    s = Settings()

    assert isinstance(s.ALLOWED_EMAILS, list)
    assert len(s.ALLOWED_EMAILS) == 0  # No default emails - must be configured via env var


def test_admin_emails_default():
    """ADMIN_EMAILS defaults to empty list when env var not set"""
    from app.config import Settings
    s = Settings()

    assert isinstance(s.ADMIN_EMAILS, list)
    assert len(s.ADMIN_EMAILS) == 0  # No default admin emails - must be configured via env var


def test_admin_emails_from_env(monkeypatch):
    """ADMIN_EMAILS can be configured via environment variable"""
    monkeypatch.setenv("ADMIN_EMAILS", "admin1@example.com,admin2@example.com")
    from app.config import Settings
    s = Settings()

    assert s.ADMIN_EMAILS == ["admin1@example.com", "admin2@example.com"]

def test_allowed_emails_from_env(monkeypatch):
    """ALLOWED_EMAILS can be configured via environment variable"""
    monkeypatch.setenv("ALLOWED_EMAILS", "user1@example.com,user2@example.com")
    from app.config import Settings
    s = Settings()

    assert s.ALLOWED_EMAILS == ["user1@example.com", "user2@example.com"]

def test_allowed_emails_handles_whitespace(monkeypatch):
    """ALLOWED_EMAILS trims whitespace from emails"""
    monkeypatch.setenv("ALLOWED_EMAILS", " user1@example.com , user2@example.com ")
    from app.config import Settings
    s = Settings()

    assert s.ALLOWED_EMAILS == ["user1@example.com", "user2@example.com"]

def test_allowed_emails_ignores_empty_entries(monkeypatch):
    """ALLOWED_EMAILS ignores empty entries from trailing commas"""
    monkeypatch.setenv("ALLOWED_EMAILS", "user1@example.com,,user2@example.com,")
    from app.config import Settings
    s = Settings()

    assert s.ALLOWED_EMAILS == ["user1@example.com", "user2@example.com"]