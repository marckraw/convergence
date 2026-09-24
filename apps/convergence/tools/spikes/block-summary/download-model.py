"""Download only the pinned public model, without reading Hugging Face credentials."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent
MODEL = "mlx-community/Qwen2.5-1.5B-Instruct-4bit"
REVISION = "8b403126fc14f14cfc99bb4cfa72ecbc129ea677"
with urllib.request.urlopen(f"https://huggingface.co/api/models/{MODEL}/revision/{REVISION}?blobs=true") as response:
    metadata = json.load(response)
files = [f for f in metadata["siblings"] if f["rfilename"].endswith((".json", ".txt", ".safetensors"))]
total = sum(f["size"] for f in files)
if total > 2_000_000_000:
    raise SystemExit(f"STOP: {total} bytes exceeds the authorized download")
target = ROOT / "models" / "qwen"
target.mkdir(parents=True, exist_ok=True)
manifest = {"model": MODEL, "revision": REVISION, "downloadBytes": total, "files": []}
for item in files:
    name = item["rfilename"]
    path = target / name
    if not path.exists() or path.stat().st_size != item["size"]:
        print(f"Downloading {name}: {item['size']} bytes", flush=True)
        urllib.request.urlretrieve(f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}", path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.stat().st_size != item["size"]:
        raise SystemExit(f"Size mismatch: {name}")
    if item.get("lfs", {}).get("sha256") not in (None, digest):
        raise SystemExit(f"SHA256 mismatch: {name}")
    manifest["files"].append({"name": name, "bytes": item["size"], "sha256": digest})
(ROOT / "model-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Verified {total} bytes", flush=True)
