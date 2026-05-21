from __future__ import annotations


class PipelineInputError(ValueError):
    """Raised when the uploaded JSON cannot be processed safely."""

    def __init__(self, message: str, details: list[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or []

