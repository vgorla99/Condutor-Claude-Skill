#!/usr/bin/env bash
# conductor-hq inventory - READ-ONLY. Lists files under one or more roots and hashes them; never prints file contents.
# Usage: bash inventory.sh <out-dir> <root> [<root> ...]
# Same output as inventory.ps1: <out-dir>/inventory.csv and <out-dir>/SUMMARY.md
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: bash inventory.sh <out-dir> <root> [<root> ...]" >&2
  exit 1
fi

out="$1"; shift
hash_max_kb=$((50 * 1024))
skip='/(node_modules|\.git|\.venv|venv|__pycache__|\.next|dist|build|out|\.cache)/'
secret='(^\.env|\.pem$|\.key$|id_rsa|credentials|secret|service-account|firebase-adminsdk)'

if command -v sha256sum >/dev/null 2>&1; then hasher='sha256sum'; else hasher='shasum -a 256'; fi
if stat -c '%s' / >/dev/null 2>&1; then stat_fmt='-c %s|%Y'; else stat_fmt='-f %z|%m'; fi

mkdir -p "$out"
csv="$out/inventory.csv"
echo '"Root","RelPath","TopDir","Ext","SizeKB","Modified","Hash","Private"' > "$csv"

csv_field() { printf '"%s"' "${1//\"/\"\"}"; }

for root in "$@"; do
  base="$(cd "$root" && pwd)"
  find "$base" -type f -print0 | while IFS= read -r -d '' f; do
    [[ "$f" =~ $skip ]] && continue
    rel="${f#"$base"/}"
    name="$(basename "$f")"
    ext=""; [[ "$name" == *.* ]] && ext=".$(printf '%s' "${name##*.}" | tr '[:upper:]' '[:lower:]')"
    IFS='|' read -r bytes mtime < <(stat $stat_fmt "$f")
    size_kb=$(awk "BEGIN { printf \"%.1f\", $bytes / 1024 }")
    modified=$(date -d "@$mtime" +%Y-%m-%d 2>/dev/null || date -r "$mtime" +%Y-%m-%d)
    hash=""
    if [ $((bytes / 1024)) -le "$hash_max_kb" ]; then hash=$($hasher "$f" | awk '{ print toupper($1) }'); fi
    private="False"; printf '%s' "$name" | grep -Eiq "$secret" && private="True"
    {
      csv_field "$base"; printf ','; csv_field "$rel"; printf ','; csv_field "${rel%%/*}"; printf ','
      csv_field "$ext"; printf ','; csv_field "$size_kb"; printf ','; csv_field "$modified"; printf ','
      csv_field "$hash"; printf ','; csv_field "$private"; printf '\n'
    } >> "$csv"
  done
done

python3 - "$csv" "$out/SUMMARY.md" <<'PY'
import csv, sys, collections, datetime, os
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))
mb = lambda rs: round(sum(float(r["SizeKB"]) for r in rs) / 1024, 1)
out = [f"# Inventory summary ({datetime.datetime.now():%Y-%m-%d %H:%M})", "",
       f"Files: {len(rows)}   Total: {mb(rows)} MB", "", "## Per root / top folder (files, MB, newest change)"]
groups = collections.defaultdict(list)
for r in rows: groups[(r["Root"], r["TopDir"])].append(r)
for (root, top), rs in sorted(groups.items()):
    out.append(f"- {root}, {top}: {len(rs)} files, {mb(rs)} MB, newest {max(r['Modified'] for r in rs)}")
out += ["", "## File types"]
for ext, n in collections.Counter(r["Ext"] or "(none)" for r in rows).most_common(20): out.append(f"- {ext}: {n}")
by_hash = collections.defaultdict(list)
for r in rows:
    if r["Hash"]: by_hash[r["Hash"]].append(r)
dupes = [g for g in by_hash.values() if len(g) > 1]
out += ["", f"## Duplicates (same content): {len(dupes)} groups, {round(sum(mb(g[1:]) for g in dupes), 1)} MB reclaimable"]
for g in sorted(dupes, key=lambda g: -float(g[0]["SizeKB"]))[:25]:
    out.append("- " + "  =  ".join(r["Root"] + "/" + r["RelPath"] for r in g))
by_name = collections.defaultdict(list)
for r in rows: by_name[os.path.basename(r["RelPath"])].append(r)
conflicts = [(n, g) for n, g in by_name.items() if len(g) > 1 and len({r["Hash"] for r in g}) > 1]
out += ["", f"## Same name, different content (conflicts): {len(conflicts)}"]
for n, g in conflicts[:25]:
    out.append(f"- {n}: " + " | ".join(f"{r['Root'] + '/' + r['RelPath']} ({r['Modified']})" for r in g))
priv = [r for r in rows if r["Private"] == "True"]
out += ["", f"## Possibly private (names only, never opened): {len(priv)}"]
out += [f"- {r['Root'] + '/' + r['RelPath']}" for r in priv[:50]]
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"Wrote {sys.argv[1]} and SUMMARY.md ({len(rows)} files).")
PY
