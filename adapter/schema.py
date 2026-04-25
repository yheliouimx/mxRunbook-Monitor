"""JSON schema validation for runbook output."""
import json
import re

# Accepted datetime strings:
#   Full ISO date (with optional time):  YYYY-MM-DD[THH:MM[:SS]]
#   Bare time (from time-only columns):  HH:MM[:SS]
# Bare times are valid because Excel/CSV files often store date and time in
# separate columns; the parser combines them when runbook_date is set in the
# mapping.  The quality checker emits a warning when no date is present so
# users know to set runbook_date if they need full timestamps.
_ISO_RE = re.compile(
    r"^("
    r"\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?"  # full ISO: YYYY-MM-DD[THH:MM[:SS]]
    r"|"
    r"\d{2}:\d{2}(:\d{2})?"                             # bare time: HH:MM[:SS]
    r")$"
)

RUNBOOK_SCHEMA = {
    "type": "object",
    "patternProperties": {
        "^_": {},  # reserved keys (_issues, _health) — any value
        "^[^_]": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["task", "status"],
                # additionalProperties: true — forward-compat with new fields (taskId, system, etc.)
                "properties": {
                    "item":            {"type": ["string", "null"]},
                    "task":            {"type": "string"},
                    "status":          {"type": "string"},
                    "startTime":       {"type": ["string", "null"]},
                    "endTime":         {"type": ["string", "null"]},
                    "assignee":        {"type": ["string", "null"]},
                    # v2 fields (all optional)
                    "taskId":          {"type": ["string", "null"]},
                    "estimatedEnd":    {"type": ["string", "null"]},
                    "system":          {"type": ["string", "null"]},
                    "party":           {"type": ["string", "null"]},
                    "comment":         {"type": ["string", "null"]},
                    # Enhancement 1 fields
                    "actualStartTime": {"type": ["string", "null"]},
                    # Enhancement 2 fields
                    "description":     {"type": ["string", "null"]},
                }
            }
        }
    }
}


def validate(data: dict) -> list[str]:
    """Validate runbook data against the schema. Returns list of error strings."""
    errors = []
    if not isinstance(data, dict):
        return ["Root must be a JSON object"]

    for key, value in data.items():
        if key.startswith("_"):
            continue  # reserved keys are free-form

        if len(key) > 100:
            errors.append(f"Category name too long (>{100} chars): '{key[:60]}...'")

        if not isinstance(value, list):
            errors.append(f"Category '{key}' must be an array, got {type(value).__name__}")
            continue

        for i, task in enumerate(value):
            if not isinstance(task, dict):
                errors.append(f"'{key}[{i}]' must be an object")
                continue
            if "task" not in task:
                errors.append(f"'{key}[{i}]' missing required field 'task'")
            if "status" not in task:
                errors.append(f"'{key}[{i}]' missing required field 'status'")
            # Time format validation: non-null time strings must be ISO-parseable
            for tf in ("startTime", "endTime", "estimatedEnd", "actualStartTime"):
                v = task.get(tf)
                if v and isinstance(v, str) and not _ISO_RE.match(v.strip()):
                    errors.append(
                        f"'{key}[{i}]' field '{tf}' is not a valid ISO datetime: '{v}' "
                        f"(expected YYYY-MM-DDTHH:MM:SS)"
                    )
    return errors


def validate_file(path: str) -> list[str]:
    """Validate a runbook JSON file. Returns list of errors."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"Invalid JSON: {e}"]
    except FileNotFoundError:
        return [f"File not found: {path}"]
    return validate(data)
