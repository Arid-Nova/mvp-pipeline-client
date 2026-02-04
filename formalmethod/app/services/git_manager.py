import os
import hashlib
from git import Repo

class GitManager:
    def __init__(self, base_work_dir="/tmp/ms_verifier_cache"):
        # Changed default dir to indicate it is a cache
        self.base_work_dir = base_work_dir
        os.makedirs(self.base_work_dir, exist_ok=True)

    def clone_repo(self, repo_url: str, branch: str = "master", commit_id: str = None) -> str:
        # Generate a stable directory name based on the Repo URL
        repo_hash = hashlib.md5(repo_url.encode()).hexdigest()
        target_dir = os.path.join(self.base_work_dir, repo_hash)

        try:
            repo = None
            
            # 1. Check if we already have it
            if os.path.exists(target_dir) and os.path.isdir(os.path.join(target_dir, ".git")):
                print(f"Cache hit: {target_dir}. Fetching updates...")
                repo = Repo(target_dir)
                repo.remotes.origin.fetch()  
            else:
                # 2. If not, clone it fresh
                print(f"Cache miss: Cloning {repo_url} into {target_dir}...")
                repo = Repo.clone_from(repo_url, target_dir)

            # 3. Checkout the specific state
            if commit_id:
                print(f"Checking out commit {commit_id}...")
                repo.git.checkout(commit_id)
            else:
                print(f"Checking out branch {branch}...")
                repo.git.checkout(branch)
                repo.remotes.origin.pull() 

            print("Repo check out is successful.")
            return target_dir

        except Exception as e:
            raise Exception(f"Git operation failed: {str(e)}")