import os
import json
from openai import AsyncOpenAI

class LLMAnalyzer():
    def __init__(self):
        self.model_name = os.getenv("OPENAI_API_MODEL", "gpt-4o-mini")
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        base_url = os.getenv("OPENAI_BASE_URL", "").strip()
        self.client = None
        if api_key:
            client_kwargs = {"api_key": api_key}
            if base_url:
                client_kwargs["base_url"] = base_url
            self.client = AsyncOpenAI(**client_kwargs)
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.1))

    async def analyze_repos_with_llm(self, org_name: str, condensed_repos: list) -> dict:

        branch_lookup = {repo["clone_url"]: repo["all_branches"] for repo in condensed_repos}
        commit_lookup = {repo["clone_url"]: repo.get("commitMap", {}) for repo in condensed_repos}

        llm_input_repos = [
            {
                "name": r["name"], 
                "description": r["description"], 
                "clone_url": r["clone_url"], 
                "default_branch": r["default_branch"]
            } 
            for r in condensed_repos
        ]

        prompt = f"""
        You are an expert Software Architect analyzing a GitHub organization's repositories to import a Microservice Architecture system.
        
        Organization Name: {org_name}
        Repositories: {json.dumps(llm_input_repos)}
        
        TASK:
        1. Deduce a logical "System Name" based on the organization and repo names. Don't use spaces. Instread use '-' if needed. 
        2. Categorize the repositories.
        - 'relevantRepos': These are core system components (microservices, API gateways, frontends, backends, databases).
        - 'suggestedRepos': These are peripheral or tooling repos (documentation, infrastructure, deployment scripts, sandboxes, deprecated code).
        
        RULES:
        - You must return ONLY a valid JSON object. Do not include markdown formatting or explanations.
        - The JSON format MUST perfectly match the following structure:
        {{
            "proposedSystemName": "String",
            "relevantRepos": [{{"url": "clone_url", "branch": "default_branch"}}],
            "suggestedRepos": [{{"url": "clone_url", "branch": "default_branch"}}]
        }}
        """
        
        try:
            if self.client is None:
                raise RuntimeError("OPENAI_API_KEY is not configured.")
            response = await self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=self.temperature, 
                )
            
            # Cleaning the response, just in case
            raw_json = response.choices[0].message.content.strip()
            if raw_json.startswith("```json"):
                raw_json = raw_json[7:-3]
                
            parsed_response = json.loads(raw_json)
            
            # Inject the branches back into the parsed LLM response
            for repo in parsed_response.get("relevantRepos", []):
                repo["branches"] = branch_lookup.get(repo["url"], [repo["branch"]])
                repo["commitMap"] = commit_lookup.get(repo["url"], {})
                
            for repo in parsed_response.get("suggestedRepos", []):
                repo["branches"] = branch_lookup.get(repo["url"], [repo["branch"]])
                repo["commitMap"] = commit_lookup.get(repo["url"], {})
                
            return parsed_response
            
        except Exception:
            # If the LLM fails or times out: return everything as 'suggested'
            fallback_repos = [{
                "url": r["clone_url"], 
                "branch": r["default_branch"],
                "branches": branch_lookup.get(r["clone_url"], [r["default_branch"]]),
                "commitMap": commit_lookup.get(r["clone_url"], {})
            } for r in condensed_repos]
            
            return {
                "proposedSystemName": f"{org_name.capitalize()} System",
                "relevantRepos": [],
                "suggestedRepos": fallback_repos
            }
