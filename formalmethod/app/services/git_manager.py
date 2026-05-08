import os
import hashlib
import urllib.request
import json
import base64
from git import Repo
import concurrent.futures

class GitManager:
    def __init__(self, base_work_dir="/tmp/ms_verifier_cache"):
        # Changed default dir to indicate it is a cache
        self.base_work_dir = base_work_dir
        os.makedirs(self.base_work_dir, exist_ok=True)
        self.config_server_url = os.getenv("CONFIG_SERVER_URL", "http://cloudhub_repohandler:8020/settings/github-token")

    def _get_github_token(self) -> str:
        internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")
        try:
            req = urllib.request.Request(self.config_server_url)
            req.add_header("X-Internal-Service-Auth", internal_key)
            
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    return data.get("token")
        except Exception as e:
            print(f"Failed to fetch authorized token: {e}")
        return None
    
    def clone_repo(self, repo_url: str, branch: str = "master", commit_id: str = None) -> str:
        # Generate a stable directory name based on the Repo URL
        repo_hash = hashlib.md5(repo_url.encode()).hexdigest()
        target_dir = os.path.join(self.base_work_dir, repo_hash)

        # Securely injecting the token into the URL
        token = self._get_github_token()

        # Ephemeral Git Configuration
        git_env = {
            "GIT_TERMINAL_PROMPT": "0" 
        }
        if token:
            auth_str = f"x-access-token:{token}"
            b64_auth = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
            
            git_env["GIT_CONFIG_COUNT"] = "1"
            git_env["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraHeader"
            git_env["GIT_CONFIG_VALUE_0"] = f"AUTHORIZATION: basic {b64_auth}"

        try:
            repo = None
            
            # 1. Check if we already have it
            if os.path.exists(target_dir) and os.path.isdir(os.path.join(target_dir, ".git")):
                print(f"Cache hit: {target_dir}. Fetching updates...")
                repo = Repo(target_dir)

                # Using the context manager to apply env variables securely
                with repo.git.custom_environment(**git_env):
                    repo.remotes.origin.fetch()  
            else:
                # 2. If not, clone it fresh
                print(f"Cache miss: Cloning {repo_url} into {target_dir}...")
                # Cloning using the clean URL, but passing the secure environment variables
                repo = Repo.clone_from(repo_url, target_dir, env=git_env)

            # 3. Checkout the specific state
            if commit_id:
                print(f"Checking out commit {commit_id}...")
                repo.git.checkout(commit_id)
            else:
                print(f"Checking out branch {branch}...")
                repo.git.checkout(branch)
                with repo.git.custom_environment(**git_env):
                    repo.remotes.origin.pull()

            print("Repo check out is successful.")
            return target_dir

        except Exception as e:
            error_msg = str(e)
            if token:
                error_msg = error_msg.replace(token, "***REDACTED***")
            raise Exception(f"Git operation failed: {error_msg}")
    
    def clone_repos_concurrently(self, repos: list, max_workers: int = 5) -> list:
        """
        Cloning multiple repositories in parallel.
        Returns a list of dictionaries mapping the original URL to the local path.
        """
        repo_mappings = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_repo = {
                executor.submit(self.clone_repo, repo.repoURL, repo.branch, repo.commitId): repo 
                for repo in repos
            }
            
            for future in concurrent.futures.as_completed(future_to_repo):
                repo_request = future_to_repo[future]
                try:
                    local_path = future.result()
                    repo_mappings.append({
                        "url": repo_request.repoURL,
                        "path": local_path
                    })
                except Exception as exc:
                    print(f"Repository {repo_request.repoURL} generated an exception: {exc}")
                    raise exc
                    
        return repo_mappings