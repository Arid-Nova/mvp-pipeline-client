import git
import tempfile
import shutil
import javalang
from javalang.tree import MethodDeclaration
from pathlib import Path
from typing import Optional

class CodeFetcher:
    # Clones a Git repository to a temporary location and provides
    # methods to fetch code snippets from it using an AST parser.

    def __init__(self, repo_url: str, branch:str):
        self.repo_url = repo_url
        self.branch = branch
        self.temp_dir = Path(tempfile.mkdtemp(prefix="sec_posture_"))
        self._clone_repo()

    def get_temp_dir(self):
        return self.temp_dir
    
    def _clone_repo(self):
        # Clones the repository.
        try:
            # print(f"Cloning {self.repo_url} into {self.temp_dir}...")
            git.Repo.clone_from(self.repo_url, self.temp_dir, branch=self.branch)
            # print("Repository cloned successfully.")
        except Exception:
            # print(f"Error cloning repository: {e}")
            raise

    def get_method_body(self, file_path_suffix: Path, method_name: str) -> Optional[str]:
        # Fetches the body of a specific method from a file using an AST.
        try:
            if file_path_suffix.is_absolute():
                file_path_suffix = file_path_suffix.relative_to('/')
                
            full_file_path = self.temp_dir / file_path_suffix

            if not full_file_path.exists():
                print(f"Warning: Could not find file at {full_file_path}")
                return None

            with open(full_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.splitlines()

            tree = javalang.parse.parse(content)
            
            for _, node in tree.filter(MethodDeclaration):
                if node.name == method_name:
                    # Found the method. Now get its full text.
                    # javalang gives start line, but not end line.
                    # We use the AST to find the start, then count braces.
                    start_line_index = node.position.line - 1
                    
                    method_text_lines = []
                    brace_count = 0
                    in_method = False

                    for i in range(start_line_index, len(lines)):
                        line = lines[i]
                        
                        if not in_method:
                            # We start counting from the line the AST told us
                            if "{" in line:
                                in_method = True
                            method_text_lines.append(line)
                            brace_count += line.count('{') - line.count('}')
                        else:
                            method_text_lines.append(line)
                            brace_count += line.count('{') - line.count('}')

                        # When brace_count is 0, we've found the closing brace
                        if in_method and brace_count <= 0:
                            return "\n".join(method_text_lines)
                            
            # print(f"Warning: Method '{method_name}' not found in {full_file_path} via AST.")
            return None # Method not found

        except Exception as e:
            print(f"Error parsing {file_path_suffix} with javalang: {e}")
            return None

    def cleanup(self):
        # Removes the temporary directory at the end of the analysis.
        # This is more of a space saving strategy.
        # print(f"Cleaning up temporary directory {self.temp_dir}.")
        try:
            shutil.rmtree(self.temp_dir)
            print("Cleanup successful.")
        except Exception as e:
            print(f"Error during cleanup: {e}")