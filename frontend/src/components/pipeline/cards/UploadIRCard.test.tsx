import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UploadIRCard, extractIRMetadata } from './UploadIRCard';
import { NodeData } from '../models';
import { fetchIRVersions, fetchSpecificIRs } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    fetchIRVersions: jest.fn(),
    fetchSpecificIRs: jest.fn(),
    deleteIR: jest.fn()
}));

const repoUrl = 'https://example.invalid/mixed.git';
const commitId = 'a'.repeat(40);
const mixedIR = () => ({
    id: 'saved-ir',
    name: 'mixed-system',
    metadata: { languages: ['java', 'typescript'] },
    javascriptExtraction: { snapshots: [{ component: {
        name: 'api', repositoryURL: repoUrl, commit: commitId,
        kind: 'backend', branch: 'release'
    } }] },
    microservices: [{
        name: 'java-api', repositoryURL: repoUrl, commitID: commitId, branch: 'main'
    }, {
        name: 'node-api', repositoryURL: repoUrl, commitID: commitId,
        metadata: { languages: ['typescript'], branch: 'feature' }
    }]
});

const backendMapping = {
    repoUrl, commitId, branch: 'release', language: 'javascript', componentKind: 'backend'
};
const node: NodeData = {
    id: 'upload', type: 'UPLOAD_IR', x: 0, y: 0, data: {}, status: 'idle', logs: []
};

beforeEach(() => jest.clearAllMocks());

test('native services reuse the same revision backend snapshot without changing its provenance', () => {
    const ir = mixedIR();
    const before = JSON.stringify(ir);
    expect(extractIRMetadata(ir, ir.id)).toEqual([backendMapping]);
    expect(JSON.stringify(ir)).toBe(before);
});

test('a same-revision frontend mapping remains distinct from its backend', () => {
    const ir = mixedIR();
    ir.javascriptExtraction.snapshots.push({ component: {
        name: 'web', repositoryURL: repoUrl, commit: commitId,
        kind: 'frontend', branch: 'web'
    } });
    expect(extractIRMetadata(ir, ir.id)).toEqual([
        backendMapping,
        { ...backendMapping, branch: 'web', componentKind: 'frontend' }
    ]);
});

test('other source revisions and legacy native branch mappings are retained', () => {
    const otherCommit = 'b'.repeat(40);
    const otherRepo = 'https://example.invalid/java.git';
    const ir = mixedIR();
    ir.microservices.push(
        { name: 'new-version', repositoryURL: repoUrl, commitID: otherCommit, branch: 'next' },
        { name: 'java-main', repositoryURL: otherRepo, commitID: commitId, branch: 'main' },
        { name: 'java-release', repositoryURL: otherRepo, commitID: commitId, branch: 'release' }
    );
    expect(extractIRMetadata(ir, ir.id)).toEqual([
        backendMapping,
        { repoUrl, commitId: otherCommit, branch: 'next', language: 'auto' },
        { repoUrl: otherRepo, commitId, branch: 'main', language: 'auto' },
        { repoUrl: otherRepo, commitId, branch: 'release', language: 'auto' }
    ]);
    expect(extractIRMetadata({ microservices: [{
        repositoryURL: otherRepo, commitID: commitId
    }] }, 'saved')).toEqual([{ repoUrl: otherRepo, commitId, branch: 'main' }]);
});

test('an absent snapshot branch uses only an explicitly observed native branch', () => {
    const ir = mixedIR();
    ir.javascriptExtraction.snapshots[0].component.branch = '';
    expect(extractIRMetadata(ir, ir.id)).toEqual([{ ...backendMapping, branch: 'main' }]);
    const withoutBranch = {
        javascriptExtraction: ir.javascriptExtraction,
        microservices: [{ repositoryURL: repoUrl, commitID: commitId }]
    };
    expect(extractIRMetadata(withoutBranch, 'saved')).toEqual([{ ...backendMapping, branch: '' }]);
});

test('local JSON upload propagates one backend repository mapping', async () => {
    const ir = mixedIR();
    const updateNodeData = jest.fn();
    const { container } = render(<UploadIRCard node={node} updateNodeData={updateNodeData} />);
    const file = new File([JSON.stringify(ir)], 'mixed.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(ir) });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(updateNodeData).toHaveBeenCalledTimes(1));
    expect(updateNodeData).toHaveBeenCalledWith(node.id, { payload: {
        irJson: ir, systemName: 'mixed-system', metadata: [backendMapping]
    } });
});

test('saved IR loading propagates one backend repository mapping', async () => {
    const ir = mixedIR();
    (fetchIRVersions as jest.Mock).mockResolvedValue([{ id: ir.id, version: '1' }]);
    (fetchSpecificIRs as jest.Mock).mockResolvedValue([ir]);
    const updateNodeData = jest.fn();
    render(<UploadIRCard node={node} updateNodeData={updateNodeData} />);
    fireEvent.click(screen.getByRole('button', { name: /Search Saved Snapshots/ }));
    fireEvent.change(screen.getByPlaceholderText('System name...'), { target: { value: 'mixed-system' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(await screen.findByText('v1'));
    await waitFor(() => expect(updateNodeData).toHaveBeenCalledTimes(1));
    expect(fetchSpecificIRs).toHaveBeenCalledWith([ir.id]);
    expect(updateNodeData).toHaveBeenCalledWith(node.id, { payload: {
        irJson: ir, systemName: 'mixed-system', metadata: [backendMapping]
    } });
});
