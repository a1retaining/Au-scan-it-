from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditLog:
    """Append-only JSONL audit log for scan, paper and risk events.

    This is not a substitute for a regulated order-management system, but it
    gives the project a hedge-fund-style trace: what happened, when, from where,
    and what the system decided.
    """

    def __init__(self, path: str | Path = "outputs/audit_log.jsonl") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, event_type: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
        event = {
            "time_utc": utc_now(),
            "event_type": event_type,
            "payload": payload or {},
        }
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event, sort_keys=True) + "\n")
        return event

    def tail(self, limit: int = 100) -> List[Dict[str, Any]]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()[-limit:]
        out: List[Dict[str, Any]] = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return out
