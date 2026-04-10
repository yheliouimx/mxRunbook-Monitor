"""JSON schema validation for runbook output."""
import json

RUNBOOK_SCHEMA = {
    "type": "object",
    "patternProperties": {
        "^_": {},  # reserved keys (_issues, _health) — any value
        "^[^_]": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["task", "status"],
                "properties": {
                    "item": {"type": ["string", "null"]},
                    "task": {"type": "string"},
                    "status": {"type": "string"},
                    "startTime": {"type": ["string", "null"]},
                    "endTime": {"type": ["string", "null"]}
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
