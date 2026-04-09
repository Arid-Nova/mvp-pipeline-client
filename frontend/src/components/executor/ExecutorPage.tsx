import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExecutionResult } from './models';

const ExecutorPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Grab the payload, including the dynamically passed roles
    const { tests = [], language = 'curl', targetUrl = 'http://localhost:8080', roles = [] } = location.state || {};

    const [activeTestIndex, setActiveTestIndex] = useState(0);
    const [results, setResults] = useState<Record<string, ExecutionResult>>({});

    // --- Dynamic Role Tokens ---
    // Initialize globalTokens based on the roles passed from the COMPONENT_GENERATE card
    const initialTokens = useMemo(() => {
        const tokens: Record<string, string> = {}; 
        
        if (roles && roles.length > 0) {
            roles.forEach((role: string) => {
                // Converting "ROLE_ADMIN" -> "ADMIN_TOKEN", or "USER" -> "USER_TOKEN"
                const tokenKey = `${role.replace(/^ROLE_/i, '').toUpperCase()}_TOKEN`;
                if (!tokens[tokenKey]) {
                    tokens[tokenKey] = ''; 
                }
            });
        } else {
            tokens['DEFAULT_TOKEN'] = '';
        }
        tokens['INVALID_TOKEN'] = 'invalid-jwt-or-bearer-token';
        return tokens;
    }, [roles]);

    const [globalTokens, setGlobalTokens] = useState<Record<string, string>>(initialTokens);

    // Fallback if accessed directly
    useEffect(() => {
        if (tests.length === 0) navigate('/pipeline');
    }, [tests, navigate]);

    const activeTest = tests[activeTestIndex];

    const getExecutableCode = (rawCode: string) => {
        let code = rawCode;
        code = code.replace(/http:\/\/localhost:\d+/g, targetUrl)
                   .replace(/https:\/\/api\.example\.com/g, targetUrl);

        Object.entries(globalTokens).forEach(([role, tokenValue]) => {
            if (tokenValue) {
                // Remove 'ROLE_' for alternative matching (e.g., ROLE_ADMIN -> ADMIN)
                const cleanRole = role.replace(/^ROLE_/i, '');
                
                const regexes = [
                    new RegExp(`[<{\\[]?${role}[>}\\]]?`, 'gi'),             // <ROLE_ADMIN>
                    new RegExp(`[<{\\[]?${role}_TOKEN[>}\\]]?`, 'gi'),       // <ROLE_ADMIN_TOKEN>
                    new RegExp(`[<{\\[]?${cleanRole}_TOKEN[>}\\]]?`, 'gi')   // <ADMIN_TOKEN>
                ];

                regexes.forEach(regex => {
                    code = code.replace(regex, tokenValue);
                });
            }
        });
        return code;
    };

    // --- Tracking Individual Assertions & Execution ---
    const handleRunSingle = async (scenarioId: string, code: string) => {
        const isJava = language.toLowerCase() === 'java';

        setResults(prev => ({
            ...prev,
            [scenarioId]: { status: 'running', logs: [`Initializing ${language.toUpperCase()} execution...`] }
        }));

        let executableCode = getExecutableCode(code);
        
        // Ensure cURL runs silently (-s) but outputs the HTTP status code at the very end (-w)
        if (!isJava && !executableCode.includes('-w')) {
            const newlineChar = String.raw`\n`;
            executableCode = `${executableCode.trim()} -s -w "${newlineChar}%{http_code}"`;
        }

        try {
            setResults(prev => ({
                ...prev,
                [scenarioId]: { 
                    ...prev[scenarioId], 
                    logs: [...prev[scenarioId].logs, `Sending ${isJava ? 'code' : 'command'} to Proxy...`, executableCode] 
                }
            }));

            // Determine route and payload based on language
            const endpoint = isJava ? '/api/execute/java' : '/api/execute/curl';
            const payload = isJava ? { code: executableCode } : { command: executableCode };

            // Call the Proxy for execution
            const proxyResponse = await fetch(`http://localhost:8010${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!proxyResponse.ok) {
                const errorData = await proxyResponse.json();
                throw new Error(errorData.detail || `Proxy Error: ${proxyResponse.status}`);
            }

            const data = await proxyResponse.json();
            
            // LOGIC FOR JAVA EXECUTION
            if (isJava) {
                const passed = data.returncode === 0;
                
                setResults(prev => ({
                    ...prev,
                    [scenarioId]: { 
                        status: passed ? 'success' : 'error', 
                        responseBody: data.stdout || "(No Output)",
                        logs: [
                            ...prev[scenarioId].logs, 
                            passed ? 'Execution completed successfully (Exit 0).' : `Execution failed (Exit ${data.returncode}).`,
                            ...(data.stderr ? [`Error Output: ${data.stderr}`] : [])
                        ],
                        passed: passed,
                        assertions: [
                            { 
                                description: `Java process exited without exceptions`, 
                                passed: passed,
                                actual: `Exit Code: ${data.returncode}`
                            }
                        ]
                    }
                }));
            } 
            // LOGIC FOR CURL EXECUTION
            else {
                if (data.returncode !== 0) {
                    throw new Error(`cURL process failed: ${data.stderr}`);
                }

                // Parse the stdout. The last line is our injected HTTP status code.
                const stdoutLines = data.stdout.trim().split('\n');
                const rawStatusCode = stdoutLines.pop(); // Remove and grab the last line
                const responseBody = stdoutLines.join('\n'); // Everything else is the body
                
                const actualStatusCode = parseInt(rawStatusCode || "0", 10);
                
                // --- ASSERTION LOGIC ---
                const expectedStatusPattern = activeTest.expected_status || "200"; 
                
                const statusPassed = actualStatusCode === parseInt(expectedStatusPattern, 10); 
                
                let isJsonValid = false;
                try {
                    if (responseBody) JSON.parse(responseBody);
                    isJsonValid = true;
                } catch {
                    isJsonValid = false;
                }

                setResults(prev => ({
                    ...prev,
                    [scenarioId]: { 
                        status: 'success', 
                        statusCode: actualStatusCode, 
                        responseBody: responseBody || "(Empty Response)",
                        logs: [...prev[scenarioId].logs, `Received HTTP ${actualStatusCode}`],
                        passed: statusPassed,
                        assertions: [
                            { 
                                description: `Expected HTTP Status to be ${expectedStatusPattern}`, 
                                passed: statusPassed,
                                actual: String(actualStatusCode)
                            },
                            { 
                                description: `Response body format is valid JSON`, 
                                passed: isJsonValid || responseBody.length === 0
                            }
                        ]
                    }
                }));
            }
        } catch (error: any) {
            setResults(prev => ({
                ...prev,
                [scenarioId]: { 
                    status: 'error', 
                    logs: [...prev[scenarioId].logs, `Execution Error: ${error.message}`],
                    passed: false,
                    assertions: [{ description: 'Execution completed without system/network errors', passed: false, actual: error.message }]
                }
            }));
        }
    };

    const handleRunAll = async () => {
        for (const test of tests) {
            setActiveTestIndex(tests.indexOf(test));
            await handleRunSingle(test.scenario_id, test.test_code);
        }
    };

    // --- Downloadable Final Report ---
    const handleDownloadReport = () => {
        const executedIds = Object.keys(results);
        const summary = {
            total_tests: tests.length,
            tests_executed: executedIds.length,
            passed: executedIds.filter(id => results[id].passed).length,
            failed: executedIds.filter(id => !results[id].passed).length,
            timestamp: new Date().toISOString(),
            target_url: targetUrl
        };

        const reportData = {
            summary,
            details: tests.map((test: any) => {
                const res = results[test.scenario_id];
                return {
                    scenario_id: test.scenario_id,
                    execution_status: res ? res.status : 'NOT_RUN',
                    passed: res ? res.passed : null,
                    status_code: res?.statusCode,
                    assertions: res?.assertions || [],
                    logs: res?.logs || []
                };
            })
        };

        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Security_Execution_Report_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!activeTest) return <div className="p-10 text-white">Loading Test Environment...</div>;

    const currentResult = results[activeTest.scenario_id] || { status: 'idle', logs: [] };
    const injectedCode = getExecutableCode(activeTest.test_code);
    const hasRunAny = Object.keys(results).length > 0;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col font-sans">
            
            <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <h1 className="font-bold text-slate-200 tracking-wide flex items-center gap-2">
                        Test Executor
                        <span className="bg-fuchsia-900/30 text-fuchsia-400 px-2 py-0.5 rounded text-[10px] uppercase border border-fuchsia-800/50">
                            {language}
                        </span>
                    </h1>
                </div>
                
                <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-400 mr-2">
                        <span className="uppercase font-bold tracking-wider text-[10px]">Target:</span>
                        <span className="font-mono text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded border border-emerald-800/50">{targetUrl}</span>
                    </div>
                    
                    {/* DOWNLOAD REPORT BUTTON */}
                    <button 
                        onClick={handleDownloadReport}
                        disabled={!hasRunAny}
                        className={`px-3 py-1.5 rounded font-bold transition-all flex items-center gap-1.5 border ${hasRunAny ? 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700' : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export Report
                    </button>

                    <button 
                        onClick={handleRunAll}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded font-bold transition-all shadow-[0_0_10px_rgba(79,70,229,0.3)] flex items-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Run All Tests
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Test Suite ({tests.length})</h2>
                    </div>
                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                        {tests.map((test: any, idx: number) => {
                            const res = results[test.scenario_id];
                            return (
                                <button
                                    key={test.scenario_id}
                                    onClick={() => setActiveTestIndex(idx)}
                                    className={`w-full text-left p-3 border-b border-slate-800/50 flex flex-col gap-1 hover:bg-slate-800/50 transition-colors ${activeTestIndex === idx ? 'bg-slate-800/80 border-l-2 border-l-fuchsia-500' : 'border-l-2 border-l-transparent'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 font-mono truncate mr-2" title={test.scenario_id}>
                                            {test.scenario_id.split(':')[0]}
                                        </span>
                                        {/* Status Indicators */}
                                        {res?.status === 'running' && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                                        {res?.status === 'success' && res?.passed && <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]"></span>}
                                        {res?.status === 'success' && res?.passed === false && <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_5px_#f43f5e]"></span>}
                                        {res?.status === 'error' && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
                                    </div>
                                    <span className={`text-xs truncate ${activeTestIndex === idx ? 'text-slate-200 font-bold' : 'text-slate-500'}`}>
                                        Test {idx + 1}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
                    
                    {/* DYNAMIC TOKENS PANEL */}
                    <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-wrap gap-4 items-center">
                        <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                            Required Variables
                        </span>
                        {Object.keys(globalTokens).map(key => (
                            <div key={key} className="flex items-center bg-slate-950 border border-slate-700 rounded-md overflow-hidden shadow-inner focus-within:border-fuchsia-500 transition-colors">
                                <span className="bg-slate-800 px-2 py-1.5 text-[9px] font-mono font-bold text-slate-300 border-r border-slate-700">
                                    {key}
                                </span>
                                <input 
                                    type="text"
                                    value={globalTokens[key]}
                                    onChange={(e) => setGlobalTokens({...globalTokens, [key]: e.target.value})}
                                    placeholder="Enter token value..."
                                    className="bg-transparent border-none outline-none text-xs px-2 py-1.5 text-emerald-400 w-48 focus:ring-0 font-mono placeholder:text-slate-700"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 p-4 flex flex-col gap-2 overflow-hidden">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Generated Script</h3>
                            <button 
                                onClick={() => handleRunSingle(activeTest.scenario_id, activeTest.test_code)}
                                disabled={currentResult.status === 'running'}
                                className={`px-4 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-2 ${currentResult.status === 'running' ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-[0_0_10px_rgba(217,70,239,0.3)]'}`}
                            >
                                {currentResult.status === 'running' ? 'Executing...' : 'Run Current Test'}
                            </button>
                        </div>
                        
                        <div className="bg-[#0d1117] border border-slate-800 rounded-lg p-4 overflow-y-auto flex-1 font-mono text-sm leading-relaxed text-slate-300 shadow-inner">
                            <pre className="whitespace-pre-wrap break-all">{injectedCode}</pre>
                        </div>
                    </div>

                    {/* EXECUTION TERMINAL & ASSERTIONS */}
                    <div className="h-64 border-t border-slate-800 bg-black flex flex-col shrink-0">
                        <div className="p-2 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/50">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Execution Output & Assertions
                            </span>
                            <div className="flex gap-2">
                                {currentResult.passed !== undefined && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${currentResult.passed ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' : 'bg-rose-900/30 text-rose-400 border border-rose-800/50'}`}>
                                        {currentResult.passed ? 'PASS' : 'FAIL'}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex flex-1 overflow-hidden">
                            {/* Left side: Standard Console Logs */}
                            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar font-mono text-xs space-y-2 border-r border-slate-800/50">
                                {currentResult.logs.length === 0 ? (
                                    <span className="text-slate-600 italic">Ready to execute...</span>
                                ) : (
                                    currentResult.logs.map((log, i) => (
                                        <div key={i} className="text-slate-400">
                                            <span className="text-fuchsia-500 mr-2">❯</span>{log}
                                        </div>
                                    ))
                                )}
                                {currentResult.responseBody && (
                                    <pre className="mt-2 text-emerald-300 bg-emerald-950/20 p-2 rounded border border-emerald-900/30 whitespace-pre-wrap break-words">
                                        {currentResult.responseBody}
                                    </pre>
                                )}
                            </div>

                            {/* Right side: Assertions Panel */}
                            <div className="w-80 bg-slate-900/30 p-3 overflow-y-auto custom-scrollbar">
                                <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Test Assertions</h4>
                                {!currentResult.assertions || currentResult.assertions.length === 0 ? (
                                    <div className="text-[10px] text-slate-600 italic">No assertions recorded yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {currentResult.assertions.map((assertion, idx) => (
                                            <div key={idx} className={`p-2 rounded border text-[10px] ${assertion.passed ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-rose-950/20 border-rose-900/50'}`}>
                                                <div className="flex items-start gap-1.5 mb-1">
                                                    {assertion.passed 
                                                        ? <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                        : <svg className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    }
                                                    <span className={assertion.passed ? 'text-emerald-200' : 'text-rose-200'}>{assertion.description}</span>
                                                </div>
                                                {assertion.expected && (
                                                    <div className="pl-5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 mt-1 font-mono text-[9px]">
                                                        <span className="text-slate-500">Expected:</span>
                                                        <span className="text-slate-300">{assertion.expected}</span>
                                                        <span className="text-slate-500">Actual:</span>
                                                        <span className={assertion.passed ? 'text-emerald-400' : 'text-rose-400'}>{assertion.actual}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ExecutorPage;