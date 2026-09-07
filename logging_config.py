"""Application logging configuration and structured log formatting."""

import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Any


_RESERVED_FIELDS = set(logging.LogRecord(None, 0, "", 0, "", (), None).__dict__)


class JsonFormatter(logging.Formatter):
    """Format application records as one JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED_FIELDS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging() -> None:
    """Configure console logging and optional rotating file logging once."""
    root_logger = logging.getLogger()
    if getattr(root_logger, "_dealpilot_configured", False):
        return

    level_name = os.environ.get("DEALPILOT_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    formatter = JsonFormatter()

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    handlers: list[logging.Handler] = [console_handler]

    log_file = os.environ.get("DEALPILOT_LOG_FILE")
    if log_file:
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=int(os.environ.get("DEALPILOT_LOG_MAX_BYTES", "10485760")),
            backupCount=int(os.environ.get("DEALPILOT_LOG_BACKUP_COUNT", "5")),
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        handlers.append(file_handler)

    root_logger.handlers.clear()
    root_logger.setLevel(level)
    for handler in handlers:
        root_logger.addHandler(handler)
    root_logger._dealpilot_configured = True

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


logger = logging.getLogger("dealpilot")
