import re
import os
import tempfile
import subprocess

from typing import Any

def execute_java_tests(code: Any):
    # 1. Find the public class name to name the file correctly
    match = re.search(r'public\s+class\s+(\w+)', code)
    if not match:
        raise RuntimeError(status_code=400, detail="Could not find a 'public class' declaration in the Java code.")
    
    class_name = match.group(1)
    
    # 2. Use a secure temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        file_path = os.path.join(temp_dir, f"{class_name}.java")
        
        # Write code to file
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        try:
            # 3. Compile the Java file
            compile_proc = subprocess.run(
                ["javac", f"{class_name}.java"], 
                cwd=temp_dir, capture_output=True, text=True
            )
            
            if compile_proc.returncode != 0:
                return {
                    "stdout": "",
                    "stderr": f"Compilation Error:\n{compile_proc.stderr}",
                    "returncode": compile_proc.returncode
                }
                
            # 4. Execute the compiled class
            run_proc = subprocess.run(
                ["java", class_name], 
                cwd=temp_dir, capture_output=True, text=True, timeout=15
            )
            
            return {
                "stdout": run_proc.stdout,
                "stderr": run_proc.stderr,
                "returncode": run_proc.returncode
            }
            
        except subprocess.TimeoutExpired:
            raise TimeoutError(status_code=504, detail="Java execution timed out.")
        except Exception as e:
            raise RuntimeError(status_code=500, detail=str(e))