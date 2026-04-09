import subprocess
import shlex

from typing import Any

def execute_curl_commands(command: Any):  
    try:
        args = shlex.split(command)
        
        # Execute the command (shell=False prevents shell injection attacks)
        result = subprocess.run(args, capture_output=True, text=True, timeout=15)
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        raise TimeoutError("Command execution timed out after 15 seconds.")
    except Exception as e:
        raise RuntimeError(str(e))