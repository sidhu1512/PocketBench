import psutil
import platform

def get_device_info():
    """Returns a clean dictionary of system specs."""
    try:
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
        cpu_name = platform.processor()
        cores = psutil.cpu_count(logical=False)
        
        system_str = f"{platform.system()} {platform.release()}"
        
        return {
            "ram_total": ram_gb,
            "cpu_cores": cores,
            "os": system_str,
            # Clean text, no icons
            "display": f"{system_str}  |  {ram_gb} GB RAM  |  {cores} Cores"
        }
    except Exception:
        return {"display": "System Info Unavailable", "ram_total": 0}

def check_memory_compatibility(file_size_bytes):
    try:
        if not file_size_bytes: return "", "gray"
        size_gb = file_size_bytes / (1024 ** 3)
        sys_ram = psutil.virtual_memory().total / (1024 ** 3)
        
        if size_gb > (sys_ram - 2):
            return f"High Memory Usage ({size_gb:.1f} GB)", "red"
        else:
            return f"Compatible ({size_gb:.1f} GB)", "green"
    except: return "", "gray"