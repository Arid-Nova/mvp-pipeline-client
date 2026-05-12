import os
import re
import httpx
import asyncio
from .configdb import config_db_service
from fastapi import HTTPException

@staticmethod
async def __fetch_branches(client: httpx.AsyncClient, branches_url: str, headers: dict) -> list[dict]:
    base_url = branches_url.split("{")[0]
    # Fetch first page to see if more exist
    response = await client.get(f"{base_url}?per_page=100", headers=headers)
    if response.status_code != 200:
        return []
    
    all_branches = response.json()
    
    if "link" in response.headers and 'rel="last"' in response.headers["link"]:
        # Extract last page number
        last_page_match = re.search(r'page=(\d+)>; rel="last"', response.headers["link"])
        if last_page_match:
            last_page = int(last_page_match.group(1))
            
            # Fetch remaining pages in parallel
            tasks = [
                client.get(f"{base_url}?per_page=100&page={p}", headers=headers) 
                for p in range(2, last_page + 1)
            ]
            pages = await asyncio.gather(*tasks)
            for p_res in pages:
                if p_res.status_code == 200:
                    all_branches.extend(p_res.json())
                    
    return all_branches

@staticmethod
def __prepareforllm(raw_repos):
    condensed_repos = []
    for repo in raw_repos:
        condensed_repos.append({
            "name": repo.get("name"),
            "description": repo.get("description", ""),
            "clone_url": repo.get("clone_url"),
            "default_branch": repo.get("default_branch"),
            "all_branches": repo.get("all_branches", []),
            "commitMap": repo.get("commitMap", {})
        })
    return condensed_repos

# Fetching repositories from GitHub API
@staticmethod
async def fetchorganizationrepos(org_name): 
    github_api_url = f"https://api.github.com/orgs/{org_name}/repos?per_page=100"
    headers = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": os.getenv("GITHUB_API_VERSION")
        }
    
    system_token = await config_db_service.get_token()
    if system_token:
        headers["Authorization"] = f"Bearer {system_token}"
    async with httpx.AsyncClient() as client:
        response = await client.get(github_api_url, headers=headers)
    
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch organization repositories.")
        
        raw_repos = response.json()

        # Ignoring archived repositories
        active_repos = [repo for repo in raw_repos if not repo.get("archived")]
        tasks = [__fetch_branches(client, repo.get("branches_url"), headers) for repo in active_repos]
        all_branches_lists = await asyncio.gather(*tasks)
        
        for repo, branches_data in zip(active_repos, all_branches_lists):
                if isinstance(branches_data, list):
                    repo["all_branches"] = [b.get("name") for b in branches_data if isinstance(b, dict) and b.get("name")]
                    
                    repo["commitMap"] = {
                        b.get("name"): b.get("commit", {}).get("sha") 
                        for b in branches_data if isinstance(b, dict) and b.get("name") and b.get("commit")
                    }
                else:
                    repo["all_branches"] = []
                    repo["commitMap"] = {}

        return __prepareforllm(active_repos)


# Fetching single repository metadata from GitHub API
@staticmethod
async def fetchrepositorymetadata(owner: str, repo: str) -> dict:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": os.getenv("GITHUB_API_VERSION")
    }

    system_token = await config_db_service.get_token()
    if system_token:
        headers["Authorization"] = f"Bearer {system_token}"

    repo_api_url = f"https://api.github.com/repos/{owner}/{repo}"

    async with httpx.AsyncClient() as client:
        repo_res = await client.get(repo_api_url, headers=headers)

        if repo_res.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found or private.")
        if repo_res.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="GitHub API rate-limited. Configure a GitHub token in Settings."
            )
        if repo_res.status_code != 200:
            raise HTTPException(
                status_code=repo_res.status_code,
                detail="Failed to fetch repository metadata."
            )

        repo_data = repo_res.json()
        default_branch = repo_data.get("default_branch")
        clone_url = repo_data.get("clone_url")
        repo_name = repo_data.get("name")

        if not default_branch or not clone_url or not repo_name:
            raise HTTPException(status_code=502, detail="Incomplete repository metadata from GitHub.")

        commit_api_url = f"https://api.github.com/repos/{owner}/{repo}/commits/{default_branch}"
        commit_res = await client.get(commit_api_url, headers=headers)

        if commit_res.status_code != 200:
            raise HTTPException(
                status_code=commit_res.status_code,
                detail=f"Failed to fetch latest commit on '{default_branch}'."
            )

        latest_sha = commit_res.json().get("sha")
        if not latest_sha:
            raise HTTPException(status_code=502, detail="Latest commit SHA missing from GitHub response.")

        return {
            "name": repo_name,
            "repoUrl": clone_url,
            "defaultBranch": default_branch,
            "latestCommit": latest_sha,
        }
