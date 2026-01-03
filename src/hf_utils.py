from gradio_client import Client, handle_file
from huggingface_hub import HfApi, scan_cache_dir, constants
import os
import shutil
import pathlib

api = HfApi()
# Update these IDs if your spaces have different names
SUBMISSION_API_ID = "siddharthbhadu/benchmark-submission-api" 
LEADERBOARD_DATASET = "siddharthbhadu/quant-benchmark-results"

# --- SEARCH & METADATA ---

def search_hf_models_rich(query):
    """Returns detailed JSON for the UI cards during search."""
    if not query: return []
    search_query = query + " gguf"
    try:
        models = api.list_models(search=search_query, limit=15, sort="downloads", direction=-1, full=True)
        results = []
        for m in models:
            results.append({
                "id": m.modelId,
                "author": m.author if m.author else m.modelId.split('/')[0],
                "name": m.modelId.split('/')[-1],
                "likes": m.likes,
                "downloads": m.downloads,
                "updated": str(m.lastModified)[:10]
            })
        return results
    except Exception as e:
        print(f"Search Error: {e}")
        return []

def list_repo_files_rich(repo_id):
    """Returns GGUF files within a specific repo."""
    if not repo_id: return []
    try:
        info = api.model_info(repo_id=repo_id, files_metadata=True)
        gguf_files = [f for f in info.siblings if f.rfilename.endswith(".gguf")]
        
        results = []
        for f in gguf_files:
            size_gb = f.size / (1024 ** 3)
            results.append({
                "name": f.rfilename,
                "size_str": f"{size_gb:.2f} GB",
                "size_bytes": f.size,
                "tags": _get_tags(f.rfilename)
            })
        return sorted(results, key=lambda x: x['name'])
    except: return []

def _get_tags(filename):
    """Extracts quantization tags (e.g. Q4_K_M) from filename."""
    parts = filename.lower().split('-')
    for p in parts:
        if p.startswith('q') or 'iq' in p:
            return p.upper().replace('.GGUF', '')
    return "GGUF"

# --- LOCAL STORAGE MANAGEMENT ---

def get_local_models():
    """
    Returns a mixed list of:
    1. Valid HF Snapshots (Green)
    2. 'Ghost' Folders (Orange) - Folders not recognized by scan_cache_dir
    3. Incomplete Blobs (Red) - Partial downloads
    """
    items = []
    
    # 1. Get Official Valid Models
    valid_repo_ids = set()
    try:
        report = scan_cache_dir()
        for repo in report.repos:
            valid_repo_ids.add(repo.repo_id)
            for revision in repo.revisions:
                gguf_files = [f for f in revision.files if f.file_name.endswith('.gguf')]
                for f in gguf_files:
                    # Note: .size_on_disk prevents crashes on some systems
                    size_gb = f.size_on_disk / (1024 ** 3)
                    items.append({
                        "type": "valid",
                        "repo_id": repo.repo_id,
                        "revision": revision.commit_hash,
                        "filename": f.file_name,
                        "size_str": f"{size_gb:.2f} GB",
                        "tags": _get_tags(f.file_name),
                        "sort_key": 1
                    })
    except Exception as e:
        print(f"Cache scan error: {e}")

    # 2. Scan for 'Ghost' Folders & Incomplete Files
    cache_root = constants.HF_HUB_CACHE
    if os.path.exists(cache_root):
        for root, dirs, files in os.walk(cache_root):
            
            # A. Check for Incomplete Files (.incomplete or .lock)
            for file in files:
                if file.endswith(".incomplete") or file.endswith(".lock"):
                    full_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(full_path)
                        size_gb = size / (1024 ** 3)
                        items.append({
                            "type": "incomplete",
                            "repo_id": "Incomplete Download",
                            "filename": file,
                            "path": full_path, # Absolute path for deletion
                            "size_str": f"{size_gb:.2f} GB",
                            "tags": "CORRUPTED",
                            "sort_key": 3
                        })
                    except: pass

            # B. Check for Ghost Repos (folders in root not in valid_repo_ids)
            if root == str(cache_root):
                for d in dirs:
                    if d.startswith("models--"):
                        repo_id_from_folder = d.replace("models--", "").replace("--", "/")
                        if repo_id_from_folder not in valid_repo_ids:
                            full_path = os.path.join(root, d)
                            size = _get_dir_size(full_path)
                            size_gb = size / (1024 ** 3)
                            items.append({
                                "type": "ghost",
                                "repo_id": repo_id_from_folder,
                                "filename": "Corrupted / Orphaned Folder",
                                "path": full_path,
                                "size_str": f"{size_gb:.2f} GB",
                                "tags": "JUNK",
                                "sort_key": 2
                            })

    # Sort: Valid first, then Ghosts, then Incomplete
    return sorted(items, key=lambda x: (x['sort_key'], x['repo_id']))

def _get_dir_size(path):
    """Calculates total size of a directory."""
    total = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total += os.path.getsize(fp)
    except: pass
    return total

def delete_local_file(repo_id=None, revision=None, filename=None, path=None):
    """
    Handles deletion of both Valid Models (via scan_cache_dir) 
    and Junk Files (via direct path).
    """
    try:
        # CASE 1: Delete by Absolute Path (Ghost/Incomplete)
        if path and os.path.exists(path):
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
            return True, "Junk file deleted"

        # CASE 2: Delete Official Model Blob
        if repo_id and revision and filename:
            report = scan_cache_dir()
            target_file = None
            # Find the specific file object
            for repo in report.repos:
                if repo.repo_id == repo_id:
                    for rev in repo.revisions:
                        if rev.commit_hash == revision:
                            for f in rev.files:
                                if f.file_name == filename:
                                    target_file = f
                                    break
            
            if target_file:
                # Delete actual data blob
                if os.path.exists(target_file.blob_path):
                    os.remove(target_file.blob_path)
                # Delete symlink pointer
                if os.path.exists(target_file.file_path):
                    os.remove(target_file.file_path)
                return True, f"Deleted {filename}"

        return False, "File not found"
    except Exception as e:
        return False, str(e)

# --- LEADERBOARD SUBMISSION ---

def submit_result_to_leaderboard(json_path):
    """Pushes the local JSON result to the Cloud Submission API."""
    if not json_path: return "No file"
    try:
        client = Client(SUBMISSION_API_ID)
        # This calls the 'handle_upload' function on your Gradio Space
        return client.predict(file_path=handle_file(json_path), api_name="/handle_upload")
    except Exception as e: 
        return f"Upload Failed: {e}"