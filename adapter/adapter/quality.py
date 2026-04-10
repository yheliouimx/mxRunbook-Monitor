"""Runbook quality checker - analyzes data for completeness, consistency, and potential issues."""
from datetime import datetime
from collections import Counter

VALID_STATUSES = {"Completed", "In Progress", "Not Started", "Blocking", "Unneeded"}


def check(data: dict) -> dict:
    """Run all quality checks on runbook data.

    Returns a dict with keys: errors (list), warnings (list), info (list).
    Each entry is a string describing the issue.
    """
    errors = []
    warnings = []
    info = []

    categories = {k: v for k, v in data.items() if not k.startswith("_") and isinstance(v, list)}

    if not categories:
        errors.append("No task categories found")
        return {"errors": errors, "warnings": warnings, "info": info}

    total_tasks = sum(len(tasks) for tasks in categories.values())
    info.append(f"{len(categories)} categories, {total_tasks} tasks total")

    all_items = []
    all_task_texts = []
    tasks_without_times = 0
    tasks_without_item = 0
    tasks_without_start = 0
    tasks_without_end = 0
    tasks_without_assignee = 0
    invalid_statuses = []

    for cat, tasks in categories.items():
        for i, task in enumerate(tasks):
            label = f"'{cat}' task {i+1}"
            task_text = task.get("task", "").strip()

            if not task_text:
                errors.append(f"{label}: empty task description")
                continue

            all_task_texts.append((cat, task_text))
            if task.get("item"):
                all_items.append((cat, task["item"]))

            status = task.get("status", "")
            if status and status not in VALID_STATUSES:
                invalid_statuses.append((label, status))

            start = task.get("startTime")
            end = task.get("endTime")
            has_start = _is_valid_time(start)
            has_end = _is_valid_time(end)

            if not has_start:
                tasks_without_start += 1
            if not has_end:
                tasks_without_end += 1
            if not has_start and not has_end:
                tasks_without_times += 1

            if has_start and has_end:
                t_start = _parse_time(start)
                t_end = _parse_time(end)
                if t_start and t_end and t_end < t_start:
                    warnings.append(f"{label}: endTime ({end}) is before startTime ({start})")

            if not task.get("item"):
                tasks_without_item += 1

            if not task.get("assignee"):
                tasks_without_assignee += 1

    # Duplicate detection
    task_counter = Counter(text for _, text in all_task_texts)
    for text, count in task_counter.items():
        if count > 1:
            cats = [cat for cat, t in all_task_texts if t == text]
            if len(set(cats)) == 1:
                warnings.append(f"Duplicate task in '{cats[0]}': \"{_truncate(text, 60)}\" (appears {count}x)")
            else:
                warnings.append(f"Duplicate task across categories: \"{_truncate(text, 60)}\" in {', '.join(set(cats))}")

    item_counter = Counter(item for _, item in all_items)
    for item, count in item_counter.items():
        if count > 1:
            warnings.append(f"Duplicate item ID: \"{item}\" used {count} times")

    # Invalid statuses
    for label, status in invalid_statuses:
        warnings.append(f"{label}: unrecognized status \"{status}\" (expected: {', '.join(sorted(VALID_STATUSES))})")

    # Category-level checks
    for cat, tasks in categories.items():
        if len(tasks) == 1:
            warnings.append(f"Category '{cat}' has only 1 task - possible typo or miscategorization")

        statuses = {task.get("status", "") for task in tasks}
        if len(statuses) == 1 and len(tasks) > 2:
            info.append(f"Category '{cat}': all {len(tasks)} tasks are \"{statuses.pop()}\"")

        # Time ordering within category
        parsed_times = []
        for i, task in enumerate(tasks):
            start = task.get("startTime")
            if _is_valid_time(start):
                t = _parse_time(start)
                if t:
                    parsed_times.append((i, t, task.get("task", "")))

        for j in range(1, len(parsed_times)):
            prev_idx, prev_time, prev_task = parsed_times[j - 1]
            curr_idx, curr_time, curr_task = parsed_times[j]
            if curr_time < prev_time:
                warnings.append(
                    f"Category '{cat}': task {curr_idx+1} (\"{_truncate(curr_task, 40)}\") "
                    f"starts before task {prev_idx+1} (\"{_truncate(prev_task, 40)}\")"
                )

    # Time gap detection between categories
    cat_times = []
    for cat, tasks in categories.items():
        starts = [_parse_time(t.get("startTime")) for t in tasks if _is_valid_time(t.get("startTime"))]
        ends = [_parse_time(t.get("endTime")) for t in tasks if _is_valid_time(t.get("endTime"))]
        starts = [s for s in starts if s]
        ends = [e for e in ends if e]
        if starts and ends:
            cat_times.append((cat, min(starts), max(ends)))

    cat_times.sort(key=lambda x: x[1])
    for j in range(1, len(cat_times)):
        prev_cat, _, prev_end = cat_times[j - 1]
        curr_cat, curr_start, _ = cat_times[j]
        gap = (curr_start - prev_end).total_seconds()
        if gap < 0:
            overlap_min = abs(gap) / 60
            if overlap_min > 60:
                info.append(f"Categories '{prev_cat}' and '{curr_cat}' overlap by {overlap_min:.0f} minutes")

    # Coverage summary
    if tasks_without_times > 0:
        pct = round(tasks_without_times / total_tasks * 100)
        level = warnings if pct > 50 else info
        level.append(f"{tasks_without_times}/{total_tasks} tasks ({pct}%) have no time estimates - Gantt/SLA will be partial")

    if tasks_without_item > 0:
        pct = round(tasks_without_item / total_tasks * 100)
        info.append(f"{tasks_without_item}/{total_tasks} tasks ({pct}%) have no item/ID label")

    if tasks_without_assignee > 0:
        pct = round(tasks_without_assignee / total_tasks * 100)
        level = warnings if pct > 50 else info
        level.append(f"{tasks_without_assignee}/{total_tasks} tasks ({pct}%) have no assignee")

    if tasks_without_start != tasks_without_end and (tasks_without_start > 0 or tasks_without_end > 0):
        info.append(f"Asymmetric time data: {tasks_without_start} missing startTime, {tasks_without_end} missing endTime")

    return {"errors": errors, "warnings": warnings, "info": info}


def format_report(result: dict) -> str:
    """Format check results as a human-readable report."""
    lines = []
    lines.append("=" * 56)
    lines.append("  RUNBOOK QUALITY REPORT")
    lines.append("=" * 56)

    if result["errors"]:
        lines.append("")
        lines.append(f"  ERRORS ({len(result['errors'])})")
        lines.append("  " + "-" * 40)
        for e in result["errors"]:
            lines.append(f"  [ERROR]   {e}")

    if result["warnings"]:
        lines.append("")
        lines.append(f"  WARNINGS ({len(result['warnings'])})")
        lines.append("  " + "-" * 40)
        for w in result["warnings"]:
            lines.append(f"  [WARNING] {w}")

    if result["info"]:
        lines.append("")
        lines.append(f"  INFO ({len(result['info'])})")
        lines.append("  " + "-" * 40)
        for i in result["info"]:
            lines.append(f"  [INFO]    {i}")

    lines.append("")
    lines.append("  " + "-" * 40)
    summary_parts = []
    if result["errors"]:
        summary_parts.append(f"{len(result['errors'])} errors")
    if result["warnings"]:
        summary_parts.append(f"{len(result['warnings'])} warnings")
    if result["info"]:
        summary_parts.append(f"{len(result['info'])} info")

    if not result["errors"] and not result["warnings"]:
        lines.append("  RESULT: PASS - no issues found")
    elif result["errors"]:
        lines.append(f"  RESULT: FAIL - {', '.join(summary_parts)}")
    else:
        lines.append(f"  RESULT: PASS with warnings - {', '.join(summary_parts)}")

    lines.append("=" * 56)
    return "\n".join(lines)


def _is_valid_time(val) -> bool:
    if not val or not isinstance(val, str):
        return False
    v = val.strip().lower()
    return v not in ("", "nan", "nat", "none", "null", "n/a")


def _parse_time(val) -> datetime | None:
    if not _is_valid_time(val):
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M",
                "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(val.strip(), fmt)
        except ValueError:
            continue
    return None


def _truncate(text: str, length: int) -> str:
    return text[:length - 3] + "..." if len(text) > length else text
