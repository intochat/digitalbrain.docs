"""Summarizes a saved Aspire `list_resources` result: one line per resource, unhealthy ones first.

Usage: python docs/superpowers/loop/resources.py <path to the saved list_resources output>
"""
import json
import sys

text = open(sys.argv[1], encoding="utf-8").read()
start = text.index("[", text.index("# RESOURCE DATA"))
resources, _ = json.JSONDecoder().raw_decode(text[start:])
rows = []
for resource in resources:
    state = resource.get("state") or "?"
    health = resource.get("health_status") or "-"
    ok = state in ("Running", "Active") and health in ("Healthy", "-") or state in ("Finished", "Exited") and resource.get("exit_code") in (0, None)
    rows.append((ok, resource.get("display_name") or resource["name"], state, health))
rows.sort(key=lambda row: (row[0], row[1]))
for ok, name, state, health in rows:
    print(f"{'  ' if ok else '!!'} {name:55} {state:12} {health}")
print(f"{sum(1 for row in rows if not row[0])} not ready of {len(rows)}")
