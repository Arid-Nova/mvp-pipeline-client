import os
import re
import httpx
import asyncio
from urllib.parse import quote
from .configdb import config_db_service
from fastapi import HTTPException

# This is a fallback if not configured.
DEFAULT_GITHUB_API_VERSION = "2022-11-28"

def _github_api_version() -> str:
    return os.getenv("GITHUB_API_VERSION") or DEFAULT_GITHUB_API_VERSION

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
async def fetchorganizationrepos(org_name): 
    github_api_url = f"https://api.github.com/orgs/{org_name}/repos?per_page=100"
    headers = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": _github_api_version()
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
async def fetchrepositorymetadata(owner: str, repo: str) -> dict:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": _github_api_version()
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
        branches_url = repo_data.get("branches_url")

        if not default_branch or not clone_url or not repo_name:
            raise HTTPException(status_code=502, detail="Incomplete repository metadata from GitHub.")

        # URL-encode the branch so refs containing '/' (e.g. release/v1) don't get parsed as path segments.
        commit_api_url = f"https://api.github.com/repos/{owner}/{repo}/commits/{quote(default_branch, safe='')}"
        commit_task = client.get(commit_api_url, headers=headers)
        branches_task = (
            __fetch_branches(client, branches_url, headers)
            if branches_url else asyncio.sleep(0, result=[])
        )
        commit_res, branches_data = await asyncio.gather(commit_task, branches_task)

        if commit_res.status_code != 200:
            raise HTTPException(
                status_code=commit_res.status_code,
                detail=f"Failed to fetch latest commit on '{default_branch}'."
            )

        latest_sha = commit_res.json().get("sha")
        if not latest_sha:
            raise HTTPException(status_code=502, detail="Latest commit SHA missing from GitHub response.")

        branches: list[str] = []
        commit_map: dict[str, str] = {}
        if isinstance(branches_data, list):
            for b in branches_data:
                if not isinstance(b, dict):
                    continue
                name = b.get("name")
                sha = b.get("commit", {}).get("sha")
                if name:
                    branches.append(name)
                    if sha:
                        commit_map[name] = sha

        # Make sure the default branch + latest commit always appear in the maps,
        # even on the rare path where the branches listing came back empty.
        if default_branch not in commit_map:
            commit_map[default_branch] = latest_sha
        if default_branch not in branches:
            branches.insert(0, default_branch)

        return {
            "name": repo_name,
            "repoUrl": clone_url,
            "defaultBranch": default_branch,
            "latestCommit": latest_sha,
            "branches": branches,
            "commitMap": commit_map,
        }


# Paginated commit list for a given branch (or any git ref).
async def fetchbranchcommits(owner: str, repo: str, branch: str, page: int = 1, per_page: int = 10) -> dict:
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": _github_api_version()
    }

    system_token = await config_db_service.get_token()
    if system_token:
        headers["Authorization"] = f"Bearer {system_token}"

    commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits"
    params = {"sha": branch, "per_page": per_page, "page": page}

    async with httpx.AsyncClient() as client:
        res = await client.get(commits_url, params=params, headers=headers)

        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository or branch not found.")
        if res.status_code == 409:
            # GitHub returns 409 for empty repos.
            return {"commits": [], "page": page, "perPage": per_page, "hasMore": False}
        if res.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="GitHub API rate-limited. Configure a GitHub token in Settings."
            )
        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Failed to fetch commits for '{branch}'."
            )

        raw = res.json()
        has_more = 'rel="next"' in res.headers.get("link", "")

        commits = []
        for c in raw:
            if not isinstance(c, dict):
                continue
            sha = c.get("sha")
            commit_block = c.get("commit") or {}
            author_block = commit_block.get("author") or {}
            full_message = commit_block.get("message") or ""
            short_message = full_message.split("\n", 1)[0][:200]
            if not sha:
                continue
            commits.append({
                "sha": sha,
                "message": short_message,
                "author": author_block.get("name") or "unknown",
                "date": author_block.get("date") or "",
            })

        return {
            "commits": commits,
            "page": page,
            "perPage": per_page,
            "hasMore": has_more,
        }
