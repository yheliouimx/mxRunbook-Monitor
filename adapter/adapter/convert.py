#!/usr/bin/env python3
"""
Runbook Converter CLI

Converts source files (CSV, Excel) into the standardized runbook.json
format consumed by the dashboard.

Usage:
    python convert.py --source data.csv --format csv
    python convert.py --source data.xlsx --format excel
    python convert.py --source data.csv --mapping mapping.yml
    python convert.py --source data.csv --format csv --output runbook.json
    python convert.py --validate runbook.json
    python convert.py --check runbook.json
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

# Add parent dir so imports work when run directly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from schema import validate
from quality import check as quality_check, format_report
from parsers import generic_csv, excel_parser


def load_mapping(path: str) -> dict:
    """Load a YAML or JSON mapping file."""
    ext = os.path.splitext(path)[1].lower()
    with open(path, "r", encoding="utf-8") as f:
        if ext in (".yml", ".yaml"):
            try:
                import yaml
                return yaml.safe_load(f)
            except ImportError:
                print("ERROR: PyYAML is required for .yml mapping files.")
                print("Install with: pip install pyyaml")
                sys.exit(1)
        else:
            return json.load(f)


def detect_format(source: str) -> str:
    """Auto-detect file format from extension."""
    ext = os.path.splitext(source)[1].lower()
    if ext == ".csv":
        return "csv"
    if ext in (".xlsx", ".xls"):
        return "excel"
    if ext == ".json":
        return "json"
    return "csv"  # fallback


def merge_preserved_keys(existing_path: str, new_data: OrderedDict) -> OrderedDict:
    """Preserve _issues, _health etc. from existing runbook.json."""
    if not os.path.exists(existing_path):
        return new_data
    try:
        with open(existing_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        for key, value in existing.items():
            if key.startswith("_"):
                new_data[key] = value
    except (json.JSONDecodeError, OSError):
        pass
    return new_data


def convert(source: str, fmt: str, mapping: dict | None = None) -> OrderedDict:
    """Convert a source file to runbook format."""
    if fmt == "csv":
        return generic_csv.parse(source, mapping)
    elif fmt == "excel":
        return excel_parser.parse(source, mapping)
    elif fmt == "json":
        with open(source, "r", encoding="utf-8") as f:
            data = json.load(f, object_pairs_hook=OrderedDict)
        return data
    else:
        print(f"ERROR: Unknown format '{fmt}'")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Convert runbook source files to dashboard JSON format"
    )
    parser.add_argument(
        "--source", "-s",
        help="Path to the source file (CSV, Excel, or JSON)"
    )
    parser.add_argument(
        "--format", "-f", dest="fmt",
        choices=["csv", "excel", "json"],
        help="Source format (auto-detected from extension if omitted)"
    )
    parser.add_argument(
        "--mapping", "-m",
        help="Path to column mapping file (YAML or JSON)"
    )
    parser.add_argument(
        "--output", "-o",
        default="runbook.json",
        help="Output path (default: runbook.json in current directory)"
    )
    parser.add_argument(
        "--validate", "-v", dest="validate_path",
        help="Validate an existing runbook.json file and exit"
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Don't preserve _issues/_health from existing runbook.json"
    )
    parser.add_argument(
        "--check", "-c", dest="check_path",
        help="Run quality report on a runbook.json file and exit"
    )

    args = parser.parse_args()

    # Validate-only mode
    if args.validate_path:
        errors = validate(json.load(open(args.validate_path, encoding="utf-8")))
        if errors:
            print(f"VALIDATION FAILED ({len(errors)} errors):")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)
        else:
            print("OK: runbook.json is valid")
            sys.exit(0)

    # Quality check mode
    if args.check_path:
        data = json.load(open(args.check_path, encoding="utf-8"))
        result = quality_check(data)
        print(format_report(result))
        sys.exit(1 if result["errors"] else 0)

    if not args.source:
        parser.error("--source is required (or use --validate)")

    # Detect format
    fmt = args.fmt or detect_format(args.source)

    # Load mapping
    mapping = None
    if args.mapping:
        mapping = load_mapping(args.mapping)

    print(f"Converting: {args.source} (format: {fmt})")

    # Convert
    data = convert(args.source, fmt, mapping)

    # Merge preserved keys
    if not args.no_merge:
        output_path = os.path.abspath(args.output)
        data = merge_preserved_keys(output_path, data)

    # Ensure _issues and _health exist
    data.setdefault("_issues", [])
    data.setdefault("_health", "Green")

    # Validate
    errors = validate(data)
    if errors:
        print(f"WARNING: Output has {len(errors)} validation issues:")
        for e in errors:
            print(f"  - {e}")
        print("Writing output anyway...")
    else:
        cat_count = len([k for k in data if not k.startswith("_")])
        task_count = sum(len(v) for k, v in data.items() if not k.startswith("_"))
        print(f"OK: {cat_count} categories, {task_count} tasks")

    # Write output
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Written to: {os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()
