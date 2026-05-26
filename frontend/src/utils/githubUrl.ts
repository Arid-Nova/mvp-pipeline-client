export interface ParsedGithubRepo {
    owner: string;
    repo: string;
}

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

export const parseGithubRepoUrl = (url: string): ParsedGithubRepo | null => {
    if (!url) return null;
    const match = url.trim().match(GITHUB_REPO_REGEX);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
};

export const canonicalizeGithubUrl = (url: string): string => {
    const parsed = parseGithubRepoUrl(url);
    if (!parsed) return url;
    return `https://github.com/${parsed.owner}/${parsed.repo}.git`;
};
