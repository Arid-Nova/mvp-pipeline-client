import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns/format';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { isValid as isValidDate } from 'date-fns/isValid';
import { NodeData, RepositoryMeta } from '../models';
import { importOrganization, fetchRepoMetadata, fetchBranchCommits } from '../../../services/api';
import { RepoData } from '../../../services/types';
import { BranchDropdown } from './BranchDropdown';
import { parseGithubRepoUrl, canonicalizeGithubUrl } from '../../../utils/githubUrl';

interface SystemInputCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

const DEFAULT_REPO: RepositoryMeta = { repoUrl: '', branch: '', commitId: '' };
const FETCH_DEBOUNCE_MS = 500;
const COMMITS_PAGE_SIZE = 10;
const REPO_METADATA_KEY = 'repoMetadata' as const;
const BRANCH_COMMITS_KEY = 'branchCommits' as const;

// Convert a repo slug like "train-ticket" or "myCoolRepo" into Title Case.
// Used as a soft default for System Name on first metadata fetch.
const prettifyRepoName = (name: string): string => {
    if (!name) return '';
    return name
        .replace(/[-_.]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
};

// Debounce any value (typically a controlled input string).
function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}

const formatRelative = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isValidDate(d)) return '';
    return formatDistanceToNow(d, { addSuffix: true });
};
const formatAbsolute = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isValidDate(d)) return iso;
    return format(d, 'PPpp');
};

// Modal branch picker. Lives in a body-level portal so it escapes the
// pipeline card's overflow clipping and gives users room to scan/search.
const BranchPickerModal: React.FC<{
    open: boolean;
    onClose: () => void;
    branches: string[];
    commitMap: Record<string, string>;
    defaultBranch?: string;
    selected: string;
    repoLabel?: string;
    onSelect: (branch: string) => void;
}> = ({ open, onClose, branches, commitMap, defaultBranch, selected, repoLabel, onSelect }) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setQuery('');
            return;
        }
        const t = window.setTimeout(() => inputRef.current?.focus(), 30);
        return () => window.clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', handleKey);
        };
    }, [open, onClose]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter(b => b.toLowerCase().includes(q));
    }, [branches, query]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
        >
            <div
                className="w-full max-w-md max-h-[80vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/80">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-100">Select branch</h3>
                        {repoLabel && (
                            <p className="text-[10px] text-slate-500 truncate" title={repoLabel}>{repoLabel}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                        aria-label="Close branch picker"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-slate-800">
                    <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${branches.length} branches…`}
                            className="w-full text-xs bg-slate-950 border border-slate-700 rounded pl-8 pr-2 py-2 focus:border-blue-500 outline-none text-slate-100"
                        />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                        Showing {filtered.length} of {branches.length}
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                    {filtered.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 italic">No branches match "{query}".</div>
                    ) : (
                        <ul className="divide-y divide-slate-800/70">
                            {filtered.map(branch => {
                                const sha = commitMap[branch];
                                const isSelected = branch === selected;
                                const isDefault = branch === defaultBranch;
                                return (
                                    <li key={branch}>
                                        <button
                                            type="button"
                                            onClick={() => { onSelect(branch); onClose(); }}
                                            className={`group w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                                                isSelected ? 'bg-blue-500/15 hover:bg-blue-500/20' : 'hover:bg-slate-800/70'
                                            }`}
                                        >
                                            <div className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${
                                                isSelected ? 'border-blue-400 bg-blue-500/30' : 'border-slate-600 group-hover:border-slate-400'
                                            }`}>
                                                {isSelected && (
                                                    <svg className="w-2.5 h-2.5 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs truncate ${isSelected ? 'text-blue-100 font-medium' : 'text-slate-200'}`}>
                                                        {branch}
                                                    </span>
                                                    {isDefault && (
                                                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            default
                                                        </span>
                                                    )}
                                                </div>
                                                {sha && (
                                                    <span className="block text-[10px] text-slate-500 font-mono truncate">{sha.slice(0, 12)}</span>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const BranchField: React.FC<{
    value: string;
    branches: string[];
    commitMap: Record<string, string>;
    defaultBranch?: string;
    placeholder?: string;
    loading?: boolean;
    invalid?: boolean;
    repoLabel?: string;
    onChange: (val: string) => void;
    onSelect: (val: string) => void;
}> = ({ value, branches, commitMap, defaultBranch, placeholder, loading, invalid, repoLabel, onChange, onSelect }) => {
    const [pickerOpen, setPickerOpen] = useState(false);

    const borderClass = invalid
        ? 'border-red-500/60 focus-within:border-red-500'
        : 'border-slate-700 focus-within:border-blue-500';

    return (
        <div className="relative w-1/2">
            <div className={`flex items-center w-full text-xs bg-slate-950 border rounded transition-colors ${borderClass}`}>
                <input
                    type="text"
                    placeholder={placeholder || 'Branch'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent p-1.5 outline-none"
                />
                {loading ? (
                    <div className="w-3 h-3 mr-2 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                ) : branches.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="flex items-center gap-1 px-1.5 py-1 text-slate-400 hover:text-blue-300"
                        aria-label="Browse branches"
                        title={`Browse all ${branches.length} branches`}
                    >
                        <span className="text-[9px] tabular-nums font-bold">{branches.length}</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                ) : null}
            </div>

            <BranchPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                branches={branches}
                commitMap={commitMap}
                defaultBranch={defaultBranch}
                selected={value}
                repoLabel={repoLabel}
                onSelect={onSelect}
            />
        </div>
    );
};

// Paginated commit picker. Powered by useInfiniteQuery — pages persist in
// the cache, "Load more" appends the next page, no manual state juggling.
const CommitPickerModal: React.FC<{
    open: boolean;
    onClose: () => void;
    repoUrl: string;
    branch: string;
    selectedSha: string;
    onSelect: (sha: string) => void;
}> = ({ open, onClose, repoUrl, branch, selectedSha, onSelect }) => {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        isError,
        error,
        refetch,
    } = useInfiniteQuery({
        queryKey: [BRANCH_COMMITS_KEY, repoUrl, branch],
        queryFn: ({ pageParam, signal }) =>
            fetchBranchCommits(repoUrl, branch, pageParam, COMMITS_PAGE_SIZE, signal),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
        enabled: open && !!repoUrl && !!branch,
        staleTime: 60_000,
    });

    const commits = useMemo(
        () => (data?.pages ?? []).flatMap(p => p.commits),
        [data],
    );

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', handleKey);
        };
    }, [open, onClose]);

    if (!open) return null;

    const initialLoading = isFetching && commits.length === 0;
    const showError = isError && commits.length === 0;
    const errorMessage = (error as Error | null)?.message || 'Failed to load commits.';

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
        >
            <div
                className="w-full max-w-lg max-h-[80vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/80">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-100">Select commit</h3>
                        <p className="text-[10px] text-slate-500 truncate">
                            <span className="font-mono text-slate-400">{branch}</span>
                            {repoUrl ? ` · ${repoUrl}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                        aria-label="Close commit picker"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                    {initialLoading ? (
                        <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                            <div className="w-3 h-3 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                            Loading commits…
                        </div>
                    ) : showError ? (
                        <div className="p-6 text-center space-y-3">
                            <p className="text-xs text-red-400">{errorMessage}</p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="text-[10px] uppercase tracking-wider font-bold text-blue-400 hover:text-blue-300"
                            >
                                Retry
                            </button>
                        </div>
                    ) : commits.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 italic">
                            No commits found for this branch.
                        </div>
                    ) : (
                        <>
                            <ul className="divide-y divide-slate-800/70">
                                {commits.map(c => {
                                    const isSelected = c.sha === selectedSha;
                                    const relTime = formatRelative(c.date);
                                    const absTime = formatAbsolute(c.date);
                                    return (
                                        <li key={c.sha}>
                                            <button
                                                type="button"
                                                onClick={() => { onSelect(c.sha); onClose(); }}
                                                className={`group w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                                                    isSelected ? 'bg-blue-500/15 hover:bg-blue-500/20' : 'hover:bg-slate-800/70'
                                                }`}
                                            >
                                                <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                                                    isSelected ? 'border-blue-400 bg-blue-500/30' : 'border-slate-600 group-hover:border-slate-400'
                                                }`}>
                                                    {isSelected && (
                                                        <svg className="w-2.5 h-2.5 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs leading-snug ${isSelected ? 'text-blue-100 font-medium' : 'text-slate-200'} break-words`}>
                                                        {c.message || '(no message)'}
                                                    </p>
                                                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                                        <span className="font-mono text-slate-400">{c.sha.slice(0, 7)}</span>
                                                        <span>·</span>
                                                        <span className="truncate">{c.author}</span>
                                                        <span>·</span>
                                                        <span title={absTime}>{relTime || absTime}</span>
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="px-4 py-3 flex items-center justify-between border-t border-slate-800">
                                <span className="text-[10px] text-slate-500">
                                    {commits.length} commit{commits.length === 1 ? '' : 's'}{hasNextPage ? '' : ' · end of history'}
                                </span>
                                {hasNextPage && (
                                    <button
                                        type="button"
                                        onClick={() => fetchNextPage()}
                                        disabled={isFetchingNextPage}
                                        className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded border border-blue-700/60 bg-blue-900/20 text-blue-300 hover:bg-blue-800/30 disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
                                    >
                                        {isFetchingNextPage ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                                                Loading…
                                            </>
                                        ) : 'Load more'}
                                    </button>
                                )}
                            </div>
                            {isError && commits.length > 0 && (
                                <p className="px-4 pb-3 text-[10px] text-red-400">{errorMessage}</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const CommitField: React.FC<{
    value: string;
    repoUrl: string;
    branch: string;
    canBrowse: boolean;
    invalidWarning?: boolean;
    onChange: (val: string) => void;
    onSelect: (val: string) => void;
}> = ({ value, repoUrl, branch, canBrowse, invalidWarning, onChange, onSelect }) => {
    const [pickerOpen, setPickerOpen] = useState(false);
    const borderClass = invalidWarning
        ? 'border-yellow-500/60 focus-within:border-yellow-500'
        : 'border-slate-700 focus-within:border-blue-500';

    return (
        <div className="relative w-1/2">
            <div className={`flex items-center w-full text-xs bg-slate-950 border rounded transition-colors ${borderClass}`}>
                <input
                    type="text"
                    placeholder="Commit SHA"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent p-1.5 outline-none font-mono"
                />
                <button
                    type="button"
                    onClick={() => canBrowse && setPickerOpen(true)}
                    disabled={!canBrowse}
                    className="flex items-center px-1.5 py-1 text-slate-400 hover:text-blue-300 disabled:text-slate-700 disabled:cursor-not-allowed"
                    aria-label="Browse commits"
                    title={canBrowse ? 'Browse commit history' : 'Set a branch first to browse commits'}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
            </div>

            {canBrowse && (
                <CommitPickerModal
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    repoUrl={repoUrl}
                    branch={branch}
                    selectedSha={value}
                    onSelect={onSelect}
                />
            )}
        </div>
    );
};

// Soft-fill patch produced from a successful metadata fetch.
interface SoftFillPatch {
    repo?: Partial<RepositoryMeta>;
    systemName?: string;
}

const RepoRow: React.FC<{
    repo: RepositoryMeta;
    index: number;
    isMultiRepo: boolean;
    systemName: string;
    onUpdateField: (field: keyof RepositoryMeta, value: string) => void;
    onSelectBranch: (branch: string) => void;
    onSoftFill: (patch: SoftFillPatch) => void;
    onRemove: () => void;
}> = ({ repo, index, isMultiRepo, systemName, onUpdateField, onSelectBranch, onSoftFill, onRemove }) => {
    const trimmedUrl = (repo.repoUrl || '').trim();
    const urlParsed = trimmedUrl ? parseGithubRepoUrl(trimmedUrl) : null;
    const urlInvalid = !!trimmedUrl && !urlParsed;

    // Debounce the URL going into the queryKey so keystrokes don't spam the API.
    const debouncedUrl = useDebouncedValue(trimmedUrl, FETCH_DEBOUNCE_MS);
    const debouncedCanonical = useMemo(
        () => (parseGithubRepoUrl(debouncedUrl) ? canonicalizeGithubUrl(debouncedUrl) : ''),
        [debouncedUrl],
    );

    const { data, isFetching, isError, error } = useQuery({
        queryKey: [REPO_METADATA_KEY, debouncedCanonical],
        queryFn: ({ signal }) => fetchRepoMetadata(debouncedUrl, signal),
        enabled: !!debouncedCanonical,
    });

    // Soft-fill branch + commit + (for row 0) System Name once per canonical URL.
    // Only depends on `data` — we deliberately read the latest repo/systemName
    // from closure rather than re-running on every keystroke.
    const lastAppliedRef = useRef<string>('');
    useEffect(() => {
        if (!data?.repoUrl) return;
        if (lastAppliedRef.current === data.repoUrl) return;
        lastAppliedRef.current = data.repoUrl;

        const canonical = data.repoUrl;
        const branchEmpty = !repo.branch;
        const nextBranch = branchEmpty ? data.defaultBranch : repo.branch;
        const commitEmpty = !repo.commitId;
        const nextCommit = commitEmpty
            ? (data.commitMap?.[nextBranch] || data.latestCommit)
            : repo.commitId;

        const repoPatch: Partial<RepositoryMeta> = {};
        if (repo.repoUrl !== canonical) repoPatch.repoUrl = canonical;
        if (repo.branch !== nextBranch) repoPatch.branch = nextBranch;
        if (repo.commitId !== nextCommit) repoPatch.commitId = nextCommit;

        const patch: SoftFillPatch = {};
        if (Object.keys(repoPatch).length > 0) patch.repo = repoPatch;
        if (index === 0 && !systemName && data.name) {
            patch.systemName = prettifyRepoName(data.name);
        }
        if (patch.repo || patch.systemName !== undefined) {
            onSoftFill(patch);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const branches = data?.branches ?? [];
    const commitMap = data?.commitMap ?? {};
    const defaultBranch = data?.defaultBranch;
    const branchInvalid = !!data && !!repo.branch && branches.length > 0 && !branches.includes(repo.branch);
    const knownLatestForBranch = commitMap[repo.branch];
    const commitMismatch = !!data && !!repo.commitId && !!knownLatestForBranch && knownLatestForBranch !== repo.commitId;

    const urlBorder = urlInvalid
        ? 'border-red-500/60 focus:border-red-500'
        : isError
            ? 'border-red-500/60 focus:border-red-500'
            : data
                ? 'border-emerald-600/50 focus:border-emerald-500'
                : 'border-slate-700 focus:border-blue-500';

    return (
        <div className={isMultiRepo ? 'p-2 border border-slate-800 bg-slate-900 rounded' : ''}>
            {isMultiRepo && (
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                        Repository {index + 1}
                    </span>
                    <button
                        onClick={onRemove}
                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-xs font-bold -mt-1 -mr-1"
                        title="Remove Repository"
                    >✕</button>
                </div>
            )}

            {!isMultiRepo && (
                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-0.5">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.17c-3.34.72-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.31-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12.01 12.01 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    Repository URL
                </label>
            )}

            <div className="space-y-2">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="e.g., https://github.com/..."
                        value={repo.repoUrl || ''}
                        onChange={(e) => onUpdateField('repoUrl', e.target.value)}
                        className={`w-full text-xs bg-slate-950 border rounded p-1.5 pr-7 outline-none transition-colors ${urlBorder}`}
                    />
                    {isFetching && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                    )}
                    {!isFetching && !!data && !urlInvalid && (
                        <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>

                {urlInvalid && (
                    <p className="text-[9px] text-red-400 leading-snug">Enter a valid GitHub repository URL.</p>
                )}
                {!urlInvalid && isError && (
                    <p className="text-[9px] text-red-400 leading-snug">{(error as Error)?.message || 'Failed to fetch repository metadata.'}</p>
                )}

                <div className="flex gap-1">
                    <BranchField
                        value={repo.branch || ''}
                        branches={branches}
                        commitMap={commitMap}
                        defaultBranch={defaultBranch}
                        placeholder="Branch"
                        loading={isFetching && branches.length === 0}
                        invalid={branchInvalid}
                        repoLabel={repo.repoUrl || undefined}
                        onChange={(v) => onUpdateField('branch', v)}
                        onSelect={onSelectBranch}
                    />
                    <CommitField
                        value={repo.commitId || ''}
                        repoUrl={repo.repoUrl || ''}
                        branch={repo.branch || ''}
                        canBrowse={!!urlParsed && !!repo.branch}
                        invalidWarning={commitMismatch}
                        onChange={(v) => onUpdateField('commitId', v)}
                        onSelect={(v) => onUpdateField('commitId', v)}
                    />
                </div>

                {branchInvalid && (
                    <p className="text-[9px] text-red-400 leading-snug">Branch not found on this repository.</p>
                )}
                {commitMismatch && !branchInvalid && (
                    <p className="text-[9px] text-yellow-400 leading-snug">
                        Commit differs from the latest on <span className="font-bold">{repo.branch}</span>.
                    </p>
                )}
            </div>
        </div>
    );
};

export const SystemInputCard: React.FC<SystemInputCardProps> = ({ node, updateNodeData }) => {
    const [mode, setMode] = useState<'manual' | 'org'>('manual');
    const [orgUrl, setOrgUrl] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [orgError, setOrgError] = useState<string | null>(null);

    // --- State for the Org Review Screen ---
    const [reviewedSystemName, setReviewedSystemName] = useState('');
    const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
    const [branchSelections, setBranchSelections] = useState<Record<string, string>>({});

    const repositories: RepositoryMeta[] = node.data.repositories && node.data.repositories.length > 0
        ? node.data.repositories
        : [DEFAULT_REPO];
    const orgData = node.data.orgImportData;

    useEffect(() => {
        if (orgData) {
            setReviewedSystemName(node.data.systemName || orgData.proposedSystemName);
            const initialSelected = new Set<string>();
            const initialBranches: Record<string, string> = {};

            orgData.relevantRepos.forEach(r => {
                initialSelected.add(r.url);
                initialBranches[r.url] = r.branch;
            });
            orgData.suggestedRepos.forEach(r => {
                initialBranches[r.url] = r.branch;
            });

            setSelectedUrls(initialSelected);
            setBranchSelections(initialBranches);
        }
    }, [orgData, node.data.systemName]);

    const updateRepo = (index: number, field: keyof RepositoryMeta, value: string) => {
        const newRepos = [...repositories];
        newRepos[index] = { ...newRepos[index], [field]: value };
        updateNodeData(node.id, { repositories: newRepos });
    };

    const handleSelectBranch = (index: number, branch: string) => {
        const current = repositories[index];
        if (!current) return;
        const newRepos = [...repositories];
        // If commit is empty, BranchField caller (BranchPickerModal) has access
        // to commitMap and would normally pass the matching SHA — but our public
        // API is one-arg. Keep the current commitId; commit auto-fill happens via
        // the soft-fill effect when the branch picker is the source.
        newRepos[index] = { ...current, branch };
        updateNodeData(node.id, { repositories: newRepos });
    };

    const handleSoftFill = (index: number) => (patch: SoftFillPatch) => {
        const newData: Partial<NodeData['data']> = {};
        if (patch.repo) {
            const newRepos = [...repositories];
            newRepos[index] = { ...newRepos[index], ...patch.repo };
            newData.repositories = newRepos;
        }
        if (patch.systemName !== undefined) {
            newData.systemName = patch.systemName;
        }
        if (Object.keys(newData).length > 0) {
            updateNodeData(node.id, newData);
        }
    };

    const removeRepo = (index: number) => {
        const newRepos = repositories.filter((_, i) => i !== index);
        updateNodeData(node.id, { repositories: newRepos.length > 0 ? newRepos : [DEFAULT_REPO] });
    };

    const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const parsedRepos: RepositoryMeta[] = [];

            lines.forEach((line, i) => {
                const parts = line.split(',');
                if (i === 0 && !line.includes('/') && !line.includes('http') && line.toLowerCase().includes('url')) {
                    return;
                }
                if (parts.length >= 1 && parts[0].trim()) {
                    parsedRepos.push({
                        repoUrl: parts[0].trim(),
                        branch: parts[1]?.trim() || '',
                        commitId: parts[2]?.trim() || '',
                    });
                }
            });

            if (parsedRepos.length > 0) {
                const currentRepos = repositories.filter(r => r.repoUrl.trim() !== '');
                updateNodeData(node.id, { repositories: [...currentRepos, ...parsedRepos] });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleAnalyzeOrg = async () => {
        if (!orgUrl.trim()) {
            setOrgError('Please enter a valid GitHub Organization URL.');
            return;
        }
        setIsAnalyzing(true);
        setOrgError(null);
        try {
            const response = await importOrganization(orgUrl);
            updateNodeData(node.id, { orgImportData: response });
        } catch (err: any) {
            setOrgError(err.message || 'Failed to analyze organization. Ensure your settings token is valid.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleRepoSelection = (url: string) => {
        const newSet = new Set(selectedUrls);
        if (newSet.has(url)) newSet.delete(url);
        else newSet.add(url);
        setSelectedUrls(newSet);
    };

    const handleConfirmSelection = () => {
        if (!orgData) return;
        const allRepos = [...orgData.relevantRepos, ...orgData.suggestedRepos];
        const finalRepos: RepositoryMeta[] = allRepos
            .filter(r => selectedUrls.has(r.url))
            .map(r => {
                const selectedBranch = branchSelections[r.url] || r.branch;
                const actualCommitSha = r.commitMap?.[selectedBranch] ?? '';
                return {
                    repoUrl: r.url,
                    branch: selectedBranch,
                    commitId: actualCommitSha,
                };
            });

        updateNodeData(node.id, {
            systemName: reviewedSystemName,
            repositories: finalRepos,
            orgImportData: undefined,
        });

        setMode('manual');
    };

    const renderOrgRepoRow = (repo: RepoData) => {
        const isSelected = selectedUrls.has(repo.url);
        return (
            <div
                key={repo.url}
                onClick={() => toggleRepoSelection(repo.url)}
                className={`flex items-center gap-2 p-2 border rounded mb-1.5 cursor-pointer transition-all duration-200 ${
                    isSelected
                        ? 'border-purple-500/50 bg-purple-900/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/80'
                }`}
            >
                <div className={`flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-600 bg-slate-800/50'
                }`}>
                    {isSelected && (
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-[10px] truncate transition-colors ${isSelected ? 'text-purple-300 font-bold' : 'text-slate-300'}`} title={repo.url}>
                        {repo.url.split('/').slice(-1)[0].replace('.git', '')}
                    </p>
                </div>
                <BranchDropdown
                    repoUrl={repo.url}
                    currentBranch={branchSelections[repo.url] || repo.branch}
                    branches={repo.branches || [repo.branch]}
                    isSelected={isSelected}
                    onSelect={(val) => setBranchSelections(prev => ({ ...prev, [repo.url]: val }))}
                />
            </div>
        );
    };

    return (
        <div className="space-y-3 mt-2">
            <div className="flex bg-slate-900/80 rounded p-1 border border-slate-700/50">
                <button
                    onClick={() => setMode('manual')}
                    className={`flex-1 text-[9px] font-bold tracking-wider uppercase py-1.5 rounded transition-colors ${mode === 'manual' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Manual Entry
                </button>
                <button
                    onClick={() => setMode('org')}
                    className={`flex-1 text-[9px] font-bold tracking-wider uppercase py-1.5 rounded transition-colors ${mode === 'org' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Import Org
                </button>
            </div>

            {mode === 'manual' ? (
                <>
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                        {repositories.map((repo, index) => (
                            <RepoRow
                                key={`repo-${index}`}
                                repo={repo}
                                index={index}
                                isMultiRepo={repositories.length > 1}
                                systemName={node.data.systemName || ''}
                                onUpdateField={(field, value) => updateRepo(index, field, value)}
                                onSelectBranch={(branch) => handleSelectBranch(index, branch)}
                                onSoftFill={handleSoftFill(index)}
                                onRemove={() => removeRepo(index)}
                            />
                        ))}
                    </div>

                    <div className="space-y-1 pt-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">
                            System Name
                        </label>
                        <input
                            type="text"
                            placeholder="Auto-filled from the repository — edit if you'd like"
                            value={node.data.systemName || ''}
                            onChange={(e) => updateNodeData(node.id, { systemName: e.target.value })}
                            className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                        <button
                            onClick={() => updateNodeData(node.id, { repositories: [...repositories, { ...DEFAULT_REPO }] })}
                            className="group relative flex-1 py-1.5 text-[10px] font-bold tracking-wider uppercase text-blue-400 border border-dashed border-blue-800 rounded hover:bg-blue-900/30 transition-colors"
                        >
                            + Add Repo
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[150px] bg-slate-800 border border-slate-700 shadow-xl rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100] normal-case tracking-normal text-left font-normal">
                                <p className="text-[10px] text-slate-200 font-bold mb-1 border-b border-slate-700 pb-1">Manual Entry</p>
                                <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                                    Add a new row to manually specify another repository.
                                </p>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                            </div>
                        </button>

                        <span className="text-[10px] text-slate-500 font-bold uppercase">or</span>

                        <label className="group relative flex-1 py-1.5 text-[10px] font-bold tracking-wider uppercase text-teal-400 border border-dashed border-teal-800 rounded hover:bg-teal-900/30 transition-colors cursor-pointer text-center flex items-center justify-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            CSV Upload
                            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[180px] bg-slate-800 border border-slate-700 shadow-xl rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100] normal-case tracking-normal text-left font-normal">
                                <p className="text-[10px] text-slate-200 font-bold mb-1 border-b border-slate-700 pb-1">Expected CSV Columns:</p>
                                <ol className="text-[9px] text-slate-400 list-decimal pl-3 space-y-0.5">
                                    <li><span className="text-teal-400">URL</span> <span className="text-slate-500">(Required)</span></li>
                                    <li><span className="text-slate-300">Branch</span> <span className="text-slate-500">(Optional)</span></li>
                                    <li><span className="text-slate-300">Commit ID</span> <span className="text-slate-500">(Optional)</span></li>
                                </ol>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                            </div>
                        </label>
                    </div>
                </>
            ) : (
                <div className="space-y-4 pt-1">
                    {orgData ? (
                        <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">
                                    Proposed System Name
                                </label>
                                <input
                                    type="text"
                                    value={reviewedSystemName}
                                    onChange={(e) => setReviewedSystemName(e.target.value)}
                                    className="w-full text-xs bg-slate-900/80 border border-slate-700/80 rounded-md py-2 px-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-slate-100 transition-all shadow-inner"
                                />
                            </div>

                            <div className="max-h-[190px] overflow-y-auto pr-1.5 custom-scrollbar space-y-4">
                                <div>
                                    <div className="flex items-center justify-between sticky top-0 bg-slate-900/60 backdrop-blur-md py-2 z-10 border-b border-slate-700/50 mb-2">
                                        <h4 className="text-[9px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Relevant
                                        </h4>
                                        <span className="text-[8px] font-bold bg-teal-500/10 text-teal-300 px-1.5 py-0.5 rounded-full border border-teal-500/20">
                                            {orgData.relevantRepos.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {orgData.relevantRepos.map(renderOrgRepoRow)}
                                        {orgData.relevantRepos.length === 0 && <p className="text-[9px] text-slate-500 italic px-1">No core microservices found.</p>}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between sticky top-0 bg-slate-900/60 backdrop-blur-md py-2 z-10 border-b border-slate-700/50 mb-2">
                                        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            Suggested
                                        </h4>
                                        <span className="text-[8px] font-bold bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-600/50">
                                            {orgData.suggestedRepos.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {orgData.suggestedRepos.map(renderOrgRepoRow)}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-slate-700/50">
                                <button
                                    onClick={() => updateNodeData(node.id, { orgImportData: undefined })}
                                    className="flex-1 py-2 text-[9px] font-bold tracking-wider uppercase text-slate-400 bg-slate-800/50 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmSelection}
                                    disabled={selectedUrls.size === 0}
                                    className="flex-[2] py-2 text-[9px] font-bold tracking-wider uppercase text-white bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border disabled:border-slate-700 disabled:cursor-not-allowed rounded-md transition-all shadow-md shadow-purple-900/20 flex items-center justify-center gap-1.5"
                                >
                                    <span>Confirm Selection</span>
                                    <span className="bg-black/20 px-1.5 py-0.5 rounded text-[8px]">{selectedUrls.size}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">
                                    <svg className="w-3 h-3 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                    Organization URL
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., https://github.com/..."
                                    value={orgUrl}
                                    onChange={(e) => setOrgUrl(e.target.value)}
                                    className="w-full text-xs bg-slate-900/80 border border-slate-700/80 rounded-md py-2 px-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-slate-100 transition-all shadow-inner"
                                    disabled={isAnalyzing}
                                />
                            </div>

                            {orgError && (
                                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-md">
                                    <svg className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-[10px] text-rose-300/90 leading-tight">{orgError}</p>
                                </div>
                            )}

                            <button
                                onClick={handleAnalyzeOrg}
                                disabled={isAnalyzing || !orgUrl.trim()}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:border disabled:border-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold tracking-wider uppercase rounded-md transition-all shadow-md shadow-purple-900/20 flex items-center justify-center gap-2"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <svg className="animate-spin h-3.5 w-3.5 text-purple-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Analyzing Organization
                                    </>
                                ) : (
                                    'Extract Microservices'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
