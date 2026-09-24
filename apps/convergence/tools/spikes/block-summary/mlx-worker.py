"""Resident JSONL worker; local model only, fresh KV cache for every request."""
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent
os.environ["HF_HOME"] = str(ROOT / ".cache" / "huggingface")
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import mlx.core as mx
from mlx_lm import generate, load
from mlx_lm.sample_utils import make_sampler

start = time.perf_counter()
model, tokenizer = load(str(ROOT / "models" / "qwen"), tokenizer_config={"local_files_only": True, "trust_remote_code": False})
mx.eval(model.parameters())
load_ms = (time.perf_counter() - start) * 1000
for line in sys.stdin:
    request = json.loads(line)
    start = time.perf_counter()
    try:
        prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": request["prompt"]}],
            tokenize=False, add_generation_prompt=True,
        )
        sentence = generate(model, tokenizer, prompt=prompt, max_tokens=96,
                            sampler=make_sampler(temp=0), verbose=False)
        mx.synchronize()
        reply = {"id": request["id"], "sentence": sentence,
                 "generationMs": (time.perf_counter() - start) * 1000,
                 "loadMs": load_ms, "metalPeakBytes": mx.get_peak_memory()}
    except Exception as error:
        reply = {"id": request["id"], "error": repr(error),
                 "generationMs": (time.perf_counter() - start) * 1000}
    print(json.dumps(reply), flush=True)
