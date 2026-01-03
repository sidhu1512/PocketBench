import os
import subprocess
import shutil
import glob
import json
import time
from datetime import datetime
from .storage import save_result
from .hf_utils import submit_result_to_leaderboard

TEMP_OUTPUT_DIR = "temp_outputs"
LOGS_DIR = "logs"

os.makedirs(TEMP_OUTPUT_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

current_process = None

def kill_current_process():
    """Stops the currently running benchmark."""
    global current_process
    if current_process:
        if current_process.poll() is None:
            current_process.terminate()
        current_process = None
        return True
    return False

def run_batch_process(jobs_list, batch_size, device="auto", verbosity="INFO"):
    global current_process
    
    # 1. Create Log File
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = f"BATCH_{batch_id}.log"
    log_file_path = os.path.join(LOGS_DIR, log_filename)
    
    def log_yield(text, res=None, path=None, start_info=None):
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(text)
        return text, res, path, start_info

    # 2. Yield Initial Info
    total_jobs = len(jobs_list)
    start_msg = f"--- BATCH STARTED: {total_jobs} Models Scheduled ---\nDevice: {device} | Batch Size: {batch_size}\n\n"
    yield log_yield(start_msg, start_info={"log_file": log_filename})

    MAX_RETRIES = 2  # Benchmark Retries
    UPLOAD_RETRIES = 3 # Upload Retries

    for index, job in enumerate(jobs_list):
        repo_id = job['repo_id']
        gguf_filename = job['filename']
        tasks = job.get('tasks', ['mmlu'])
        limit = job.get('limit', 0)
        
        job_header = f"\n{'='*40}\nJOB {index+1}/{total_jobs}: {gguf_filename}\n{'='*40}\n"
        yield log_yield(job_header)

        # Setup Command
        run_timestamp = datetime.now().strftime("%H%M%S")
        current_output_path = os.path.join(TEMP_OUTPUT_DIR, f"{batch_id}_{index}_{run_timestamp}")
        os.makedirs(current_output_path, exist_ok=True)
        
        model_args = f"pretrained={repo_id},gguf_file={gguf_filename}"
        
        cmd = [
            "lm_eval", "--model", "hf", "--model_args", model_args, 
            "--tasks", ",".join(tasks), "--output_path", current_output_path, 
            "--batch_size", str(int(batch_size))
        ]
        
        # Only add limit if explicitly requested > 0
        if limit and int(limit) > 0: 
            cmd.extend(["--limit", str(int(limit))])
            
        if device and device != "auto": 
            cmd.extend(["--device", device])

        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

        # --- BENCHMARK RETRY LOOP ---
        for attempt in range(MAX_RETRIES + 1):
            if attempt > 0:
                yield log_yield(f"\n[RETRY] Benchmark Attempt {attempt}/{MAX_RETRIES}. Waiting 10s...\n")
                time.sleep(10)

            try:
                current_process = subprocess.Popen(
                    cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                    text=True, bufsize=1, encoding="utf-8", env=env
                )
                
                while True:
                    if current_process is None: break
                    line = current_process.stdout.readline()
                    if not line:
                        if current_process is None or current_process.poll() is not None: break
                        continue
                    if "%|" not in line and "Running loglikelihood" not in line:
                        yield log_yield(line)

                rc = current_process.poll() if current_process else -1
                current_process = None

                if rc == 0:
                    json_files = glob.glob(os.path.join(current_output_path, "**", "*.json"), recursive=True)
                    if json_files:
                        try:
                            with open(json_files[0], 'r') as f: data = json.load(f)
                            unique_name = f"{repo_id}_{gguf_filename}"
                            saved_path = save_result(unique_name, data, repo_id=repo_id, gguf_file=gguf_filename)
                            yield log_yield(f"\n[SUCCESS] Results saved: {saved_path}\n")
                            
                            # --- UPLOAD RETRY LOOP ---
                            uploaded = False
                            for up_try in range(UPLOAD_RETRIES):
                                try:
                                    yield log_yield(f"[UPLOAD] Auto-uploading (Attempt {up_try+1})...\n")
                                    msg = submit_result_to_leaderboard(saved_path)
                                    yield log_yield(f"[UPLOAD] {msg}\n")
                                    uploaded = True
                                    break 
                                except Exception as up_err:
                                    yield log_yield(f"[UPLOAD ERROR] {up_err}. Retrying in 5s...\n")
                                    time.sleep(5)
                            
                            if not uploaded:
                                yield log_yield("[UPLOAD] Failed after retries. Result is saved locally.\n")

                        except Exception as e:
                            yield log_yield(f"\n[ERROR] Result Processing Failed: {e}\n")
                    else:
                        yield log_yield("\n[ERROR] No JSON output generated.\n")
                    
                    break # Success, exit benchmark loop
                
                elif rc == -1:
                    yield log_yield("\n[STOPPED] User Cancelled.\n")
                    return
                else:
                    yield log_yield(f"\n[FAILURE] Crashed (Code {rc}).\n")

            except Exception as e:
                yield log_yield(f"\n[CRITICAL] Job Exception: {e}\n")
        
        try: shutil.rmtree(current_output_path)
        except: pass
        time.sleep(2)

    yield log_yield(f"\n{'='*40}\nBATCH COMPLETE\n{'='*40}\n", res=[], path=None)