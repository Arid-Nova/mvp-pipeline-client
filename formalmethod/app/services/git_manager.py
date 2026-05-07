import os
import hashlib
import concurrent.futures
import httpx
from cryptography.fernet import Fernet
from git import Repo

class GitManager:
    def __init__(self, base_work_dir="/tmp/ms_verifier_cache"):
        # Changed default dir to indicate it is a cache
        self.base_work_dir = base_work_dir
        os.makedirs(self.base_work_dir, exist_ok=True)

    def __get_decrypted_github_token(self) -> str:
        try:
            response = httpx.get("http://localhost:8020/settings/github-token")
            if response.status_code != 200:
                return None
                
            encrypted_token = response.json().get("token")         
            encryption_key = os.getenv("ENCRYPTION_KEY")

            cipher_suite = Fernet(encryption_key.encode('utf-8'))
            decrypted_token = cipher_suite.decrypt(encrypted_token.encode('utf-8')).decode('utf-8')
            
            return decrypted_token
        except Exception as e:
            print(f"Failed to fetch and decrypt token: {e}")
            return None

    def __get_authenticated_url(self, repo_url: str) -> str:
        """
        Injects the GitHub token into the HTTPS URL if available.
        Replaces https://github.com... with https://<token>@github.com...
        """
        token = self.__get_decrypted_github_token()
 
        if token and repo_url.startswith("https://"):
            return repo_url.replace("https://", f"https://{token}@")
        return repo_url

    def clone_repo(self, repo_url: str, branch: str = "master", commit_id: str = None) -> str:
        # Generate a stable directory name based on the Repo URL
        repo_hash = hashlib.md5(repo_url.encode()).hexdigest()
        target_dir = os.path.join(self.base_work_dir, repo_hash)
        auth_url = self.__get_authenticated_url(repo_url)

        try:
            repo = None
            
            # 1. Check if we already have it
            if os.path.exists(target_dir) and os.path.isdir(os.path.join(target_dir, ".git")):
                print(f"Cache hit: {target_dir}. Fetching updates...")
                repo = Repo(target_dir)
                repo.remotes.origin.set_url(auth_url) 
                repo.remotes.origin.fetch()  
            else:
                # 2. If not, clone it fresh
                print(f"Cache miss: Cloning {repo_url} into {target_dir}...")
                repo = Repo.clone_from(auth_url, target_dir)

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