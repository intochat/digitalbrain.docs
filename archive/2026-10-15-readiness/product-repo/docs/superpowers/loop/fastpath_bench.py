"""Fast-path bench (plan Task 4 Steps 4-5): sentences become synapses through POST /apps/{name}/synapse.

Usage: python docs/superpowers/loop/fastpath_bench.py [--demo-only]
Creates the notes app if missing, writes the MVP demo sentence onto it, then the 10-sentence bench over
installed contracts, and prints each outcome plus p50/p95 elapsed and the first-try compile rate. The
demo is then exercised: a file is captured on owner/apps/notes/input and owner/apps/notes/answer is read.
Reading app state until an outcome is recorded is measurement, not product polling.
"""
import json
import os
import statistics
import subprocess
import sys
import time
import urllib.request
import uuid

HTTP = "http://localhost:5080/brains/owner"
HERE = os.path.dirname(os.path.abspath(__file__))


def http(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(HTTP + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode() or "null")


def mcp(contract, key, method, args):
    call = {"contract": contract, "key": key, "method": method, "arguments": json.dumps(args)}
    out = subprocess.run([sys.executable, os.path.join(HERE, "mcp.py"), "neurons_call", json.dumps(call)], capture_output=True, text=True)
    return out.stdout.strip()


def ensure_notes():
    if http("GET", "/apps/notes").get("manifest", {}).get("title"):
        return
    manifest = {"title": "Notes", "description": "Short notes and automations around them.",
                "operations": [{"name": "open", "description": "Open the notes."}], "settings": [], "slots": []}
    print("create notes:", mcp("DigitalBrain.Apps.IApp", "owner/apps/notes", "Create",
                                [manifest, "# Notes\n\nA notes input (owner/apps/notes/input, a file input) and a notes answer text (owner/apps/notes/answer)."])[:200])


def write(app, sentence, focus):
    started = time.time()
    snapshot = http("POST", f"/apps/{app}/synapse", {"sentence": sentence, "focus": focus})
    entry = [s for s in snapshot.get("synapses", []) if s.get("sentence") == sentence][-1]
    operation = entry["operationId"]
    while time.time() - started < 120:
        entry = [s for s in http("GET", f"/apps/{app}")["synapses"] if s["operationId"] == operation][0]
        if entry["status"] != "Requested":
            break
        time.sleep(1)
    entry["wallMs"] = int((time.time() - started) * 1000)
    return entry


SENTENCES = [
    ("calculator", "when the calculator sum text changes, write the sum doubled into my double text", ["owner/apps/calculator/sum"]),
    ("word-count", "when someone asks word-count, also write the number of characters of the input into my chars text", ["owner/apps/word-count"]),
    ("calculator", "when the calculator display changes, keep the last five values in my history text, newest first", ["owner/apps/calculator/display"]),
    ("word-count", "when the word-count answer text changes, copy it in upper case into my shout text", ["owner/apps/word-count/answer"]),
    ("calculator", "when the calculator C key is clicked, write cleared into my log text", ["owner/apps/calculator/key-12"]),
    ("calculator", "when the calculator sum changes, write even or odd into my parity text", ["owner/apps/calculator/sum"]),
    ("word-count", "when word-count is asked, write the longest word of the input into my longest text", ["owner/apps/word-count"]),
    ("notes", "when I drop a file on my notes input, write the file name into my notes title text", ["owner/apps/notes/input"]),
    ("notes", "when I drop a file on my notes input, write the number of lines in it into my notes lines text", ["owner/apps/notes/input"]),
    ("calculator", "when someone asks the calculator to add, write the request input into my last request text", ["owner/apps/calculator"]),
]
DEMO = ("notes", "when I drop a file on my notes input, count its words and put the count in my notes answer text", ["owner/apps/notes/input"])


def main():
    ensure_notes()
    demo = write(*DEMO)
    print("DEMO:", json.dumps({k: demo.get(k) for k in ("status", "path", "elapsedMs", "attempts", "base", "errors", "wallMs")}))
    if demo["status"] == "Written":
        time.sleep(3)
        print("capture:", mcp("DigitalBrain.Flutter.FileInput.IFileInput", "owner/apps/notes/input", "Capture", ["note.txt", "one two three four five six seven eight nine"])[:120])
        for _ in range(20):
            answer = mcp("DigitalBrain.Flutter.Text.IText", "owner/apps/notes/answer", "Read", [])
            if '"markdown": ""' not in answer and "markdown" in answer:
                break
            time.sleep(1)
        print("answer:", answer.replace("\n", " ")[:200])
    if "--demo-only" in sys.argv:
        return
    results = [write(*item) for item in SENTENCES]
    for (app, sentence, _), entry in zip(SENTENCES, results):
        print(f"{entry['status']:8} {entry.get('elapsedMs')}ms attempts={entry.get('attempts')} base={entry.get('base')} {app}: {sentence[:70]}"
              + (f"\n          errors: {entry.get('errors')}" if entry["status"] != "Written" else ""))
    written = [e for e in results if e["status"] == "Written"]
    times = sorted(e["elapsedMs"] for e in written)
    if times:
        p95 = times[min(len(times) - 1, int(round(0.95 * (len(times) - 1))))]
        print(f"written {len(written)}/{len(results)}; p50 {statistics.median(times):.0f} ms; p95 {p95} ms; "
              f"first-try compile rate {sum(1 for e in written if e.get('attempts') == 1)}/{len(results)}")
    else:
        print(f"written 0/{len(results)}")


if __name__ == "__main__":
    main()
