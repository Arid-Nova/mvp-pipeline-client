import os
import tempfile
import subprocess

from typing import Any

from fastapi import HTTPException


def execute_python_tests(code: Any):
    with tempfile.TemporaryDirectory() as temp_dir:
            # Pytest automatically discovers files that start with "test_"
            file_path = os.path.join(temp_dir, "test_execution.py")

            # Write code to file
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)

            try:
                # Execute using pytest.
                # -v makes the output readable, --disable-warnings hides dependency clutter
                run_proc = subprocess.run(
                    ["pytest", "test_execution.py", "-v", "--disable-warnings"],
                    cwd=temp_dir, capture_output=True, text=True, timeout=15
                )

                # Pytest return codes: 0 = All passed, 1 = Some tests failed, 2+ = Setup/Syntax errors
                return {
                    "stdout": run_proc.stdout,
                    "stderr": run_proc.stderr,
                    "returncode": run_proc.returncode
                }

            except subprocess.TimeoutExpired:
                raise HTTPException(status_code=504, detail="Python execution timed out.")
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
