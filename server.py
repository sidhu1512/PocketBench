from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from src import hf_utils, backend, system_info
import json
import os
import datetime

app = Flask(__name__, static_folder='static')
CORS(app)

# --- CONFIGURATION ---
POPULAR_TASKS = [
    "mmlu", "gsm8k", "hellaswag", "arc_challenge", 
    "winogrande", "truthfulqa_mc2", "piqa", "lambada_openai"
]

# --- STATIC FILES ---
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# --- PROCESS CONTROL ---
@app.route('/api/stop', methods=['POST'])
def api_stop():
    success = backend.kill_current_process()
    if success: return jsonify({"status": "success", "msg": "Process stopped"})
    return jsonify({"status": "error", "msg": "No running process found"})

@app.route('/api/system_info')
def api_system():
    return jsonify(system_info.get_device_info())

# --- HUGGING FACE API ---
@app.route('/api/search')
def api_search():
    query = request.args.get('q', '')
    if not query: return jsonify([])
    results = hf_utils.search_hf_models_rich(query)
    return jsonify(results)

@app.route('/api/files')
def api_files():
    repo = request.args.get('repo', '')
    if not repo: return jsonify([])
    files = hf_utils.list_repo_files_rich(repo)
    return jsonify(files)

# --- LOCAL MODEL MANAGER ---
@app.route('/api/local_models')
def api_local_models():
    return jsonify(hf_utils.get_local_models())

@app.route('/api/delete_model', methods=['POST'])
def api_delete_model():
    data = request.json
    repo_id = data.get('repo_id')
    revision = data.get('revision')
    filename = data.get('filename')
    path = data.get('path')
    
    if not path and (not repo_id or not revision):
        return jsonify({"status": "error", "msg": "Missing parameters"})
        
    success, msg = hf_utils.delete_local_file(repo_id, revision, filename, path)
    status = "success" if success else "error"
    return jsonify({"status": status, "msg": msg})

# --- BENCHMARK EXECUTION ---
@app.route('/api/tasks')
def api_tasks_list():
    return jsonify(sorted(POPULAR_TASKS))

@app.route('/api/run', methods=['POST'])
def api_run():
    data = request.json
    
    # Process Jobs
    if 'jobs' in data:
        jobs = data['jobs']
    else:
        # Fallback for old requests
        jobs = [{
            "repo_id": data.get('repo_id'),
            "filename": data.get('filename'),
            "tasks": data.get('tasks', ['mmlu']),
            "limit": 0 # Default to NO LIMIT
        }]

    batch_size = data.get('batch', 1)
    device = data.get('device', 'auto')
    verbosity = data.get('verbosity', 'INFO')

    def generate_logs():
        for log_chunk, results, path, start_info in backend.run_batch_process(
            jobs, batch_size, device, verbosity
        ):
            payload = {
                "log": log_chunk, 
                "results": results, 
                "path": path,
                "start_info": start_info,
                "done": False
            }
            if "BATCH COMPLETE" in log_chunk: payload["done"] = True
            yield f"data: {json.dumps(payload)}\n\n"
            
    return Response(generate_logs(), mimetype='text/event-stream')

# --- LOG HISTORY ---
@app.route('/api/logs_list')
def api_logs_list():
    try:
        if not os.path.exists("logs"): return jsonify([])
        files = []
        for f in os.listdir("logs"):
            if f.endswith(".log"):
                path = os.path.join("logs", f)
                stats = os.stat(path)
                size_kb = stats.st_size / 1024
                
                parts = f.split("__") # Format: BATCH_Date_Time.log or Date_Model.log
                name_disp = f if len(parts) < 2 else parts[-1].replace(".log", "")
                
                # Try parsing timestamp
                date_disp = "Unknown"
                try:
                    ts_str = f.split("BATCH_")[1].split(".")[0]
                    dt = datetime.datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
                    date_disp = dt.strftime("%Y-%m-%d %H:%M")
                except: 
                    date_disp = datetime.datetime.fromtimestamp(stats.st_mtime).strftime("%Y-%m-%d %H:%M")

                files.append({
                    "filename": f,
                    "date": date_disp,
                    "name": name_disp,
                    "size": f"{size_kb:.1f} KB"
                })
        return jsonify(sorted(files, key=lambda x: x['filename'], reverse=True))
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/logs_content')
def api_logs_content():
    filename = request.args.get('filename')
    if not filename: return "No filename"
    try: return send_from_directory('logs', filename)
    except Exception as e: return f"Error reading log: {e}"

@app.route('/api/logs_delete', methods=['POST'])
def api_logs_delete():
    data = request.json
    filename = data.get('filename')
    try:
        path = os.path.join("logs", filename)
        if os.path.exists(path):
            os.remove(path)
            return jsonify({"status": "success", "msg": "Log deleted"})
        return jsonify({"status": "error", "msg": "File not found"})
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})

if __name__ == '__main__':
    print("PocketBench Server running at http://localhost:5000")
    app.run(port=5000, debug=True, use_reloader=False)