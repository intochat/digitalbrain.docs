"""Summarizes IBrainRuntime.Inspect for a brain: session, heartbeat, and each behavior's status and subscriptions.

Usage: python docs/superpowers/loop/runtime.py [brain] [filter]
  brain defaults to "owner"; filter keeps behaviors whose id contains it (e.g. "calculator").
"""
import json
import os
import subprocess
import sys

brain = sys.argv[1] if len(sys.argv) > 1 else "owner"
needle = sys.argv[2] if len(sys.argv) > 2 else ""
here = os.path.dirname(os.path.abspath(__file__))
call = {"contract": "DigitalBrain.Microsoft.CSharp.Runtime.IBrainRuntime", "key": f"{brain}/runtime",
        "method": "Inspect", "arguments": "[]"}
out = subprocess.run([sys.executable, os.path.join(here, "mcp.py"), "neurons_call", json.dumps(call)],
                     capture_output=True, text=True).stdout
snapshot = json.loads(out)
print(f"session={snapshot.get('session')} fingerprint={snapshot.get('fingerprint')} heartbeat={snapshot.get('lastHeartbeat')}")
counts = {}
for behavior in snapshot.get("behaviors", []):
    counts[behavior["status"]] = counts.get(behavior["status"], 0) + 1
    if needle and needle not in behavior["id"]:
        continue
    subscriptions = behavior.get("subscriptions") or []
    extra = {k: v for k, v in behavior.items() if k not in ("id", "hash", "status", "error", "subscriptions")}
    line = f"{behavior['status']:9} {behavior['id']}  subs={len(subscriptions)}"
    if extra:
        line += f"  {json.dumps(extra)}"
    if behavior.get("error"):
        line += f"  ERROR: {behavior['error'][:300]}"
    print(line)
print("statuses:", counts)
