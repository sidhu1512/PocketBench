import os
import json
import hashlib

RESULTS_DIR = "local_results_db"
os.makedirs(RESULTS_DIR, exist_ok=True)

def get_model_id_hash(model_name):
    return hashlib.md5(model_name.encode()).hexdigest()[:8]

def check_cache(unique_name, tasks):
    model_hash = get_model_id_hash(unique_name)
    filename = os.path.join(RESULTS_DIR, f"{model_hash}.json")
    if not os.path.exists(filename): return None
    try:
        with open(filename, 'r') as f: data = json.load(f)
        saved_results = data.get("results", {})
        missing = [t for t in tasks if t not in saved_results]
        if not missing: return data
    except: return None
    return None

def save_result(unique_name, data, repo_id=None, gguf_file=None):
    """Saves results locally AND adds metadata for the leaderboard."""
    model_hash = get_model_id_hash(unique_name)
    filename = os.path.join(RESULTS_DIR, f"{model_hash}.json")
    
    # Inject Metadata
    if repo_id and gguf_file:
        data["custom_repo_id"] = repo_id
        data["custom_gguf_file"] = gguf_file
    
    with open(filename, 'w') as f:
        json.dump(data, f, indent=4)
    return filename