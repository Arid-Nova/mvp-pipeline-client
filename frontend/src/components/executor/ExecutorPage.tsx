import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExecutionResult } from './models';
import Editor from '@monaco-editor/react';
import { executeTest } from '../../services/api';

const ExecutorPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Grab the payload, including the dynamically passed roles
    const { tests = [], language = 'curl', targetUrl = 'http://localhost:1234', roles = [] } = location.state || {};

    const [activeTestIndex, setActiveTestIndex] = useState(0);
    const [results, setResults] = useState<Record<string, ExecutionResult>>({});
    const [editedCodes, setEditedCodes] = useState<Record<string, string>>({});

    // --- Code Editing ---
    const getCurrentCode = (scenarioId: string, originalCode: string) => {
        return editedCodes[scenarioId] !== undefined ? editedCodes[scenarioId] : originalCode;
    };

    // --- Dynamic Role Tokens ---
    // Initialize globalTokens based on the roles passed from the COMPONENT_GENERATE card
    const initialTokens = useMemo(() => {
        const tokens: Record<string, string> = {}; 
        
        if (roles && roles.length > 0) {
            roles.forEach((role: string) => {
                const tokenKey = `${role.replace(/^ROLE_/i, '').toUpperCase()}_TOKEN`;
                if (!tokens[tokenKey]) {
                    tokens[tokenKey] = ''; 
                }
            });
        }
        
        if (Object.keys(tokens).length === 0) {
            tokens['ADMIN_TOKEN'] = '';
            tokens['USER_TOKEN'] = '';
        }
        
        return tokens;
    }, [roles]);

    const [globalTokens, setGlobalTokens] = useState<Record<string, string>>(initialTokens);
    const [globalTargetUrl, setGlobalTargetUrl] = useState(targetUrl);

    // --- Monaco Editor Change Handler ---
    const handleCodeChange = (value: string | undefined) => {
        if (!tests[activeTestIndex]) return;
        setEditedCodes(prev => ({
            ...prev,
            [tests[activeTestIndex].scenario_id]: value || ''
        }));
    };

    // --- Execution Logic ---
    const runActiveTest = async () => {
        const activeTest = tests[activeTestIndex];
        if (!activeTest) return;

        let codeToExecute = getCurrentCode(activeTest.scenario_id, activeTest.test_code);

        // 1. Inject Config (Support both {{VAR}} and <VAR> syntaxes)
        Object.entries(globalTokens).forEach(([key, val]) => {
            codeToExecute = codeToExecute.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val);
            codeToExecute = codeToExecute.replace(new RegExp(`<${key}>`, 'gi'), val);
        });

        // Any other tokens
        codeToExecute = codeToExecute.replace(/<[A-Z0-9_]+_TOKEN>/gi, 'invalid-mock-token');
        codeToExecute = codeToExecute.replace(/\{\{[A-Z0-9_]+_TOKEN\}\}/gi, 'invalid-mock-token');

        codeToExecute = codeToExecute.replace(/{{TARGET_URL}}/gi, globalTargetUrl);
        codeToExecute = codeToExecute.replace(/<TARGET_URL>/gi, globalTargetUrl);
        codeToExecute = codeToExecute.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/gi, globalTargetUrl);

        try {
            setResults(prev => ({
                ...prev,
                [activeTest.scenario_id]: { status: 'running', logs: ['Preparing execution payload...'], assertions: [] }
            }));

            const targetLang = language.toLowerCase();
            const runLogs: string[] = [];
            const finalAssertions: any[] = [];
            
            let allProxiesPassed = true;
            let allTestsPassed = true;

            // --- CURL PARSER & EXECUTOR ---
            if (targetLang === 'curl') {
                const rawBlocks = codeToExecute.split(/(?=curl )/gi).filter(b => b.trim().startsWith('curl'));
                if (rawBlocks.length === 0) throw new Error("No valid cURL commands found in the editor.");

                for (let i = 0; i < rawBlocks.length; i++) {
                    const block = rawBlocks[i];
                    
                    // 1. Extract the assertion expectation BEFORE cleaning
                    const expectMatch = block.match(/Expecting\s+([0-9x]{3})/i);
                    const expectedStatus = expectMatch ? expectMatch[1].toLowerCase() : "2xx"; 

                    // 2. Clean the command for the backend
                    let cleanCmd = block.split('\n')
                        .map(line => {
                            if (line.trim().startsWith('#')) return ''; // Strip full-line comments
                            return line.replace(/\s*#\s*Expecting.*$/i, ''); // Strip trailing inline expectations safely
                        }) 
                        .filter(l => l.trim() !== '')
                        .map(line => line.trim().replace(/\\$/, '').trim()) // Strip trailing slash for multiline
                        .join(' ') // FLATTEN to a single line
                        .trim();

                    cleanCmd = cleanCmd.replace(/^curl\s+/i, 'curl -4 --noproxy "*" ');

                    if (globalTargetUrl) {
                        cleanCmd = cleanCmd.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/gi, globalTargetUrl);
                    }

                    runLogs.push(`> Executing cURL payload ${i + 1} of ${rawBlocks.length}...`);

                    // 3. Execute via Proxy
                    const response = await executeTest('curl', { command: cleanCmd });

                    if (!response.ok) {
                        allProxiesPassed = false;
                        allTestsPassed = false;
                        runLogs.push(`[ERROR] Proxy connection failed: HTTP ${response.status}`);
                        finalAssertions.push({ description: `Proxy Engine (Cmd ${i+1})`, passed: false, actual: `HTTP ${response.status}` });
                        break; 
                    }

                    const data = response.data;
                    
                    // Level 1: Proxy Success (Did cURL actually run without syntax/network errors?)
                    if (data.returncode !== 0) {
                        allProxiesPassed = false;
                        allTestsPassed = false;
                        const errorReason = data.stderr ? data.stderr.split('\n')[0] : 'Unknown execution failure';
                        runLogs.push(`[ERROR] cURL Execution Failed: ${errorReason}`);
                        finalAssertions.push({ description: `Proxy Engine (Cmd ${i+1})`, passed: false, expected: "Exit code 0", actual: `Exit code ${data.returncode}` });
                        continue; // Skip evaluating assertions since the request itself failed
                    }

                    finalAssertions.push({ description: `Proxy Engine (Cmd ${i+1})`, passed: true, expected: "Exit code 0", actual: "Exit code 0" });
                    
                    const output = (data.stdout || '').trim();
                    runLogs.push(`[INFO] Output: ${output}`);

                    // Level 2: Test Assertion Success
                    // Grab the last 3 characters of stdout (which should be the HTTP code injected by -w "%{http_code}")
                    const outMatch = output.match(/([0-9]{3})$/);
                    const actualStatus = outMatch ? outMatch[1] : "Unknown";
                    
                    let cmdAssertionPassed = false;
                    if (expectedStatus.includes('x')) {
                        cmdAssertionPassed = actualStatus.charAt(0) === expectedStatus.charAt(0);
                    } else {
                        cmdAssertionPassed = actualStatus === expectedStatus;
                    }

                    if (!cmdAssertionPassed) allTestsPassed = false;

                    finalAssertions.push({ 
                        description: `Test Assertion (Cmd ${i+1})`, 
                        passed: cmdAssertionPassed, 
                        expected: `Status ${expectedStatus}`, 
                        actual: `Status ${actualStatus}` 
                    });
                }
            } else {
                // --- PYTHON / JAVA EXECUTOR ---
                runLogs.push(`> Executing ${targetLang.toUpperCase()} script via Proxy...`);
                const response = await executeTest(targetLang, { code: codeToExecute });

                if (!response.ok) {
                    allProxiesPassed = false;
                    allTestsPassed = false;
                    runLogs.push(`[ERROR] Proxy failed to execute script.`);
                    finalAssertions.push({ description: "Proxy Engine Execution", passed: false, actual: `HTTP ${response.status}` });
                } else {
                    const data = response.data;
                    
                    if (data.returncode !== 0) {
                        allProxiesPassed = false;
                        allTestsPassed = false;
                        runLogs.push(`[ERROR] Script Execution Failed: ${data.stderr}`);
                        finalAssertions.push({ description: "Proxy Engine Execution", passed: false, expected: "Exit code 0", actual: `Exit code ${data.returncode}` });
                    } else {
                        finalAssertions.push({ description: "Proxy Engine Execution", passed: true, actual: "Exit code 0" });
                        
                        const output = data.stdout || '';
                        runLogs.push(`[INFO] Output: ${output}`);

                        // Heuristic for Script Assertions
                        const scriptFailed = output.toLowerCase().includes('assertionerror') || output.toLowerCase().includes('fail') || output.toLowerCase().includes('exception');
                        if (scriptFailed) allTestsPassed = false;

                        finalAssertions.push({ 
                            description: "Script Assertions", 
                            passed: !scriptFailed, 
                            expected: "Clean Exit", 
                            actual: scriptFailed ? "Exceptions/Failures Detected" : "Clean Exit" 
                        });
                    }
                }
            }

            // 4. Update Final UI State
            setResults(prev => ({
                ...prev,
                [activeTest.scenario_id]: {
                    status: (allProxiesPassed && allTestsPassed) ? 'success' : 'error',
                    logs: runLogs,
                    assertions: finalAssertions,
                    proxyPassed: allProxiesPassed,
                    testPassed: allTestsPassed
                } as any 
            }));

        } catch (error: any) {
            setResults(prev => ({
                ...prev,
                [activeTest.scenario_id]: {
                    status: 'error',
                    logs: prev[activeTest.scenario_id]?.logs 
                            ? [...prev[activeTest.scenario_id].logs, `FATAL ERROR: ${error.message}`] 
                            : [`FATAL ERROR: ${error.message}`]
                }
            }));
        }
    };

    if (!tests || tests.length === 0) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono">
                No tests loaded. Please return to the pipeline.
            </div>
        );
    }

    const activeTest = tests[activeTestIndex];
    const activeResult = results[activeTest.scenario_id];

    // Map 'curl' language to 'shell' for Monaco syntax highlighting
    const monacoLanguage = language.toLowerCase() === 'curl' ? 'shell' : language.toLowerCase();

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
            
            {/* LEFT SIDEBAR: Config & Test List */}
            <div className="w-80 bg-slate-900/50 border-r border-slate-700/50 flex flex-col shadow-2xl z-10">
                {/* Header */}
                <div className="h-16 px-5 border-b border-slate-700/50 flex items-center gap-4 bg-slate-900/80">
                    <button onClick={() => navigate('/pipeline')} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 className="text-sm font-bold tracking-wider uppercase text-slate-200">Test Executor</h2>
                        <div className="text-[10px] text-fuchsia-400 font-mono">{language.toUpperCase()} Engine</div>
                    </div>
                </div>

                {/* Global Configuration */}
                <div className="p-5 border-b border-slate-700/50 space-y-4 bg-slate-900/30">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Environment
                    </h3>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] text-slate-500 font-mono mb-1 block">TARGET_URL</label>
                            <input 
                                type="text" 
                                value={globalTargetUrl}
                                onChange={(e) => setGlobalTargetUrl(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-fuchsia-300 focus:outline-none focus:border-fuchsia-500 transition-colors"
                            />
                        </div>

                        {/* Dynamically Render Token Inputs based on Roles */}
                        {Object.entries(globalTokens).map(([tokenKey, tokenValue]) => (
                            <div key={tokenKey}>
                                <label className="text-[10px] text-slate-500 font-mono mb-1 block">{tokenKey}</label>
                                <input 
                                    type="password" 
                                    placeholder="eyJhbGci..."
                                    value={tokenValue}
                                    onChange={(e) => setGlobalTokens(prev => ({ ...prev, [tokenKey]: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Test List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {tests.map((test: any, idx: number) => {
                        const status = results[test.scenario_id]?.status;
                        return (
                            <button
                                key={test.scenario_id}
                                onClick={() => setActiveTestIndex(idx)}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                    activeTestIndex === idx 
                                        ? 'bg-slate-800 border-fuchsia-500/50 shadow-[0_0_15px_rgba(217,70,239,0.1)]' 
                                        : 'bg-slate-900/50 border-transparent hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-200 truncate">{test.scenario_id}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-1 truncate">{test.method} {test.endpoint}</div>
                                    </div>
                                    {/* Status Indicator */}
                                    <div className="shrink-0 mt-0.5">
                                        {status === 'running' && <svg className="animate-spin w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>}
                                        {status === 'success' && <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                        {status === 'error' && <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                                        {!status && <div className="w-2 h-2 rounded-full bg-slate-700 m-1"></div>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* MAIN CONTENT: Editor & Results */}
            <div className="flex-1 flex flex-col min-w-0 relative bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
                
                {/* Header Bar */}
                <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between z-10 bg-slate-950/50 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-1 rounded bg-slate-800 text-[10px] font-mono text-fuchsia-400 border border-fuchsia-500/30 uppercase tracking-widest">
                            {activeTest.method}
                        </span>
                        <span className="text-sm font-mono text-slate-300">{activeTest.endpoint}</span>
                    </div>
                    
                    <button 
                        onClick={runActiveTest}
                        disabled={activeResult?.status === 'running'}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 shadow-lg hover:shadow-emerald-900/50 transition-all active:scale-95"
                    >
                        {activeResult?.status === 'running' ? (
                            <>
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                Executing...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Run This Test
                            </>
                        )}
                    </button>
                </div>

                {/* Split View: Editor & Terminal */}
                <main className="flex-1 flex flex-col min-h-0">
                    
                    {/* Editor Pane using Monaco */}
                    <div className="flex-1 w-full border-b border-slate-700/50 relative min-h-[400px]">
                        <Editor
                            height="100%"
                            width="100%"
                            theme="vs-dark"
                            language={monacoLanguage}
                            value={getCurrentCode(activeTest.scenario_id, activeTest.test_code)}
                            onChange={handleCodeChange}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                padding: { top: 16 },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: "smooth",
                                wordWrap: "on",
                                renderLineHighlight: "all"
                            }}
                        />
                    </div>

                    {/* Results / Terminal Pane */}
                    <div className="flex-1 min-h-0 bg-black/40 flex flex-col relative overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-8 bg-slate-900/80 border-b border-slate-800 flex items-center px-4">
                            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Execution Output</span>
                        </div>
                        
                        <div className="flex-1 mt-8 p-4 overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                            {(!activeResult) ? (
                                <div className="h-full flex items-center justify-center text-slate-600">
                                    Ready to execute payload.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    
                                    {/* DUAL STATUS BADGES */}
                                    {(activeResult as any).proxyPassed !== undefined && (
                                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-800/50">
                                            <div className={`px-3 py-1.5 rounded flex items-center gap-2 border ${
                                                (activeResult as any).proxyPassed 
                                                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' 
                                                : 'bg-rose-900/20 border-rose-500/30 text-rose-400'
                                            }`}>
                                                <span className="text-[9px] uppercase tracking-widest opacity-70">Backend Proxy</span>
                                                <span className="font-bold">{(activeResult as any).proxyPassed ? 'SUCCESS (200 OK)' : 'FAILED'}</span>
                                            </div>
                                            
                                            <div className={`px-3 py-1.5 rounded flex items-center gap-2 border ${
                                                (activeResult as any).testPassed 
                                                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' 
                                                : 'bg-rose-900/20 border-rose-500/30 text-rose-400'
                                            }`}>
                                                <span className="text-[9px] uppercase tracking-widest opacity-70">Test Assertions</span>
                                                <span className="font-bold">{(activeResult as any).testPassed ? 'PASSED' : 'FAILED'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Logs */}
                                    <div className="space-y-1">
                                        {activeResult.logs.map((log, i) => (
                                            <div key={i} className={`
                                                ${log.includes('[SUCCESS]') ? 'text-emerald-400' : ''}
                                                ${log.includes('[ERROR]') || log.includes('FATAL') ? 'text-rose-400' : ''}
                                                ${log.includes('[INFO]') ? 'text-sky-400' : ''}
                                                ${!log.includes('[') ? 'text-slate-300' : ''}
                                            `}>
                                                {log}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Detailed Assertions Box */}
                                    {activeResult.assertions && activeResult.assertions.length > 0 && (
                                        <div className="mt-6 border border-slate-800 rounded bg-slate-900/50 p-3">
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 border-b border-slate-800 pb-2">Execution Breakdown</div>
                                            <div className="space-y-3">
                                                {activeResult.assertions.map((assertion, i) => (
                                                    <div key={i} className="flex items-start flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            {assertion.passed 
                                                                ? <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                : <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            }
                                                            <span className={assertion.passed ? 'text-emerald-200' : 'text-rose-200'}>{assertion.description}</span>
                                                        </div>
                                                        {assertion.expected && (
                                                            <div className="pl-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-1 font-mono text-[10px]">
                                                                <span className="text-slate-500">Expected:</span>
                                                                <span className="text-slate-300">{assertion.expected}</span>
                                                                <span className="text-slate-500">Actual:</span>
                                                                <span className={assertion.passed ? 'text-emerald-400' : 'text-rose-400'}>{assertion.actual}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ExecutorPage;