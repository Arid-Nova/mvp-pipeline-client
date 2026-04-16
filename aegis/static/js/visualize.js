const ICONS = {
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a3412" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
    cause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`,
    location: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    solution: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    riskItem: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    safeItem: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    emptyCheck: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
};

let globalData = [];
let globalVulnerabilities = [];
let currentBaseRate = 0.5;
let currentEndpointId = null;
let cy = null;

const IR_ID = document.body.getAttribute('data-ir-id');

async function fetchData() {
    if (!IR_ID) throw new Error("Missing irID");
    try {
        const response = await fetch(`/api/results?irID=${encodeURIComponent(IR_ID)}`); 
        let data = await response.json();
        globalData = data['results'];
        globalVulnerabilities = data['vulnerabilities'];
        refreshViews();
        document.getElementById('loading').classList.add('hidden');
    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('loading').innerHTML = "Error loading telemetry. Ensure analysis has run.";
    }
}

function updateBaseRate(val) {
    currentBaseRate = parseFloat(val);
    document.getElementById('base-rate-val').textContent = currentBaseRate;
    refreshViews();
}

function refreshViews() {
    updateStats(globalData);
    renderRiskCloud(globalData);
    renderArchMap(globalData);

    const searchInput = document.getElementById('endpoint-search');
    if (searchInput && searchInput.value) {
        handleSearch(searchInput.value);
    }
}

function switchTab(tabId) {
    const targetButton = event?.target || document.querySelector(`[onclick*="${tabId}"]`);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (targetButton) targetButton.classList.add('active');

    ['risk-cloud-chart', 'arch-map-chart', 'call-graph-container'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    if (tabId === 'risk-cloud') {
        document.getElementById('risk-cloud-chart').classList.remove('hidden');
        setTimeout(() => Plotly.Plots.resize('risk-cloud-chart'), 100);
    } else if (tabId === 'arch-map') {
        document.getElementById('arch-map-chart').classList.remove('hidden');
        setTimeout(() => Plotly.Plots.resize('arch-map-chart'), 100);
    } else if (tabId === 'call-graph') {
        document.getElementById('call-graph-container').classList.remove('hidden');
        if (cy) setTimeout(() => { cy.resize(); cy.fit(); }, 100);
    }
}

function calculateExpectation(opinion) {
    const b = opinion?.belief || 0;
    const u = opinion?.uncertainty || 1;
    return b + (currentBaseRate * u);
}

function formatTooltip(d) {
    const E = calculateExpectation(d.fused_opinion).toFixed(3);
    return `<b>${d.method_name}</b><br><span style="color:#64748b; font-size:11px;">${d.path_template}</span><br>Expectation: <b>${E}</b>`;
}

function updateStats(data) {
    document.getElementById('stat-endpoints').textContent = data.length;
    const totalExpectation = data.reduce((acc, curr) => acc + calculateExpectation(curr.fused_opinion), 0);
    document.getElementById('stat-risk').textContent = data.length ? (totalExpectation / data.length).toFixed(3) : '0.0';
    document.getElementById('stat-critical').textContent = data.filter(d => calculateExpectation(d.fused_opinion) < 0.3).length;
    document.getElementById('stat-conflicts').textContent = data.filter(d => {
        const op = d.fused_opinion || {belief: 0, disbelief: 0};
        return op.belief > 0.3 && op.disbelief > 0.3;
    }).length;
}

const MODERN_COLORS = [[0, '#e11d48'], [0.5, '#f59e0b'], [1, '#10b981']];
const PLOTLY_FONT = { family: "'Plus Jakarta Sans', sans-serif", color: '#0f172a' };

const HOVER_LABEL_STYLE = {
    bgcolor: '#ffffff',
    bordercolor: '#cbd5e1',
    font: { family: "'Plus Jakarta Sans', sans-serif", size: 13, color: '#0f172a' },
    align: 'left'
};

function renderRiskCloud(data) {
    const trace = {
        type: 'scatterternary', mode: 'markers',
        a: data.map(d => d.fused_opinion?.belief || 0),
        b: data.map(d => d.fused_opinion?.disbelief || 0),
        c: data.map(d => d.fused_opinion?.uncertainty || 1),
        text: data.map(d => formatTooltip(d)),
        customdata: data.map(d => d.id),
        marker: {
            color: data.map(d => calculateExpectation(d.fused_opinion)),
            colorscale: MODERN_COLORS,
            cmin: 0, 
            cmax: 1, 
            size: 12, line: { width: 1.5, color: 'white' }, opacity: 0.9,
            colorbar: { title: 'E(O)', thickness: 15, outlinewidth: 0 }
        },
        hoverinfo: 'text',
        hoverlabel: HOVER_LABEL_STYLE
    };

    const layout = {
        ternary: {
            sum: 1,
            aaxis: { title: 'Belief', color: '#10b981', linewidth: 2 },
            baxis: { title: 'Disbelief', color: '#e11d48', linewidth: 2 },
            caxis: { title: 'Uncertainty', color: '#64748b', linewidth: 2 },
            bgcolor: '#f8fafc'
        },
        font: PLOTLY_FONT,
        paper_bgcolor: 'transparent',
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };

    Plotly.newPlot('risk-cloud-chart', [trace], layout, {responsive: true, displayModeBar: false});
    document.getElementById('risk-cloud-chart').on('plotly_click', d => loadCallGraph(trace.customdata[d.points[0].pointIndex]));
}

function renderArchMap(data) {
    const trace = {
        x: data.map(d => d.fused_opinion?.belief || 0),
        y: data.map(d => d.fused_opinion?.disbelief || 0),
        z: data.map(d => d.fused_opinion?.uncertainty || 1),
        mode: 'markers',
        marker: {
            size: 8,
            color: data.map(d => calculateExpectation(d.fused_opinion)),
            colorscale: MODERN_COLORS,
            cmin: 0,
            cmax: 1,
            opacity: 0.9,
            colorbar: { title: 'E(O)', len: 0.6, thickness: 15, outlinewidth: 0 }
        },
        text: data.map(d => formatTooltip(d)),
        customdata: data.map(d => d.id),
        hoverinfo: 'text', type: 'scatter3d',
        hoverlabel: HOVER_LABEL_STYLE
    };

    const layout = {
        margin: { l: 0, r: 0, b: 0, t: 0 },
        scene: {
            xaxis: { title: 'Belief', backgroundcolor: '#f8fafc', gridcolor: '#e2e8f0' },
            yaxis: { title: 'Disbelief', backgroundcolor: '#f8fafc', gridcolor: '#e2e8f0' },
            zaxis: { title: 'Uncertainty', backgroundcolor: '#f8fafc', gridcolor: '#e2e8f0' },
        },
        font: PLOTLY_FONT,
        paper_bgcolor: 'transparent'
    };

    Plotly.newPlot('arch-map-chart', [trace], layout, {responsive: true, displayModeBar: false});
    document.getElementById('arch-map-chart').on('plotly_click', d => loadCallGraph(trace.customdata[d.points[0].pointIndex]));
}

async function loadCallGraph(endpointId) {
    try {
        currentEndpointId = endpointId;
        const endpointData = globalData.find(d => d.id === endpointId);
        const endpointVulns = globalVulnerabilities.find(v => v.id === endpointId);
        
        const response = await fetch(`/api/callgraph/${encodeURIComponent(endpointId)}`);
        const graphData = await response.json();
        
        const callGraphTab = document.getElementById('call-graph-tab');
        callGraphTab.classList.remove('hidden');
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        callGraphTab.classList.add('active');
        
        document.getElementById('risk-cloud-chart').classList.add('hidden');
        document.getElementById('arch-map-chart').classList.add('hidden');
        document.getElementById('call-graph-container').classList.remove('hidden');
        
        renderCallGraph(graphData);
        renderFindings(endpointData);
        renderLatentVulnerabilities(endpointVulns);
    } catch (error) {
        console.error(error);
        alert("Failed to load call graph data");
    }
}

function renderFindings(endpointData) {
    const findingsList = document.getElementById('findings-list');
    if (!endpointData || !endpointData.neuro_evidence || endpointData.neuro_evidence.length === 0) {
        findingsList.innerHTML = `<div class="empty-vulns">${ICONS.emptyCheck}<p>No semantic evidence found</p></div>`;
        document.getElementById('vuln-count-risk').textContent = '0';
        document.getElementById('vuln-count-safe').textContent = '0';
        return;
    }
    
    const riskEvidence = endpointData.neuro_evidence.filter(e => e.polarity === 'risk-increasing');
    const safeEvidence = endpointData.neuro_evidence.filter(e => e.polarity === 'risk-decreasing');
    
    document.getElementById('vuln-count-risk').textContent = riskEvidence.length;
    document.getElementById('vuln-count-safe').textContent = safeEvidence.length;
    
    let html = '';
    riskEvidence.forEach(vuln => {
        html += `<div class="vuln-item"><div class="vuln-finding">${ICONS.riskItem}<span>${vuln.finding}</span></div><div class="vuln-meta"><span class="meta-badge">${vuln.context || 'General'}</span><span class="meta-badge">Conf: ${(vuln.confidence * 100).toFixed(0)}%</span></div></div>`;
    });
    safeEvidence.forEach(vuln => {
        html += `<div class="vuln-item positive"><div class="vuln-finding">${ICONS.safeItem}<span>${vuln.finding}</span></div><div class="vuln-meta"><span class="meta-badge">${vuln.context || 'General'}</span><span class="meta-badge">Conf: ${(vuln.confidence * 100).toFixed(0)}%</span></div></div>`;
    });
    findingsList.innerHTML = html;
}

function renderLatentVulnerabilities(vulData) {
    const container = document.getElementById('latent-vulns-list');
    const countBadge = document.getElementById('latent-vuln-count');

    if (!vulData || !vulData.latent_vulnerabilities || vulData.latent_vulnerabilities.length === 0) {
        container.innerHTML = `<div class="empty-vulns">${ICONS.emptyCheck}<p>No latent architectures risks inferred</p></div>`;
        if (countBadge) countBadge.textContent = '0';
        return;
    }
    
    const vulns = vulData.latent_vulnerabilities;
    const causes = vulData.root_causes || [];
    const locations = vulData.suspected_locations || [];
    const solutions = vulData.possible_solutions || [];
    
    if (countBadge) countBadge.textContent = vulns.length;
    
    let html = '';
    vulns.forEach((vuln, index) => {
        html += `
            <div class="latent-vuln-card">
                <div class="latent-vuln-header">
                    <span class="vuln-icon">${ICONS.warning}</span>
                    <h4 class="vuln-title">${vuln}</h4>
                </div>
                <div class="latent-vuln-body">
                    <div class="detail-row"><div class="detail-icon">${ICONS.cause}</div><div class="detail-content"><strong>Root Cause</strong><p>${causes[index] || 'N/A'}</p></div></div>
                    <div class="detail-row"><div class="detail-icon">${ICONS.location}</div><div class="detail-content"><strong>Location</strong><p class="code-snippet">${locations[index] || 'Unknown'}</p></div></div>
                    <div class="detail-row suggestion-row"><div class="detail-icon">${ICONS.solution}</div><div class="detail-content"><strong>Remediation</strong><p>${solutions[index] || 'N/A'}</p></div></div>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function renderCallGraph(graphData) {
    document.getElementById('call-graph').innerHTML = '';
    const { nodes, relationships: edges } = graphData[0];
    const elements = [];
    
    nodes.forEach(node => {
        const labels = node.labels || [];
        const props = node.properties || {};
        
        let bg = '#d1fae5', border = '#10b981', shape = 'ellipse';
        if (labels.includes('Endpoint')) { bg = '#e0e7ff'; border = '#4f46e5'; shape = 'round-rectangle'; }
        else if (labels.includes('DataEntity')) { bg = '#ffedd5'; border = '#ea580c'; shape = 'round-rectangle'; }
        
        elements.push({
            data: {
                id: node.elementId, label: props.name || 'Unknown',
                type: labels.join(', '), role: props.role || '',
                httpMethod: props.httpMethod || '', url: props.url || '',
                bg, border, shape
            }
        });
    });
    
    edges.forEach(edge => {
        let color = '#64748b', style = 'solid';
        if (edge.type === 'CALLS_EXTERNAL') { color = '#e11d48'; style = 'dashed'; }
        else if (edge.type === 'ACCESSES') { color = '#8b5cf6'; style = 'dotted'; }
        
        elements.push({
            data: {
                id: edge.elementId, source: edge.startNodeElementId, target: edge.endNodeElementId,
                type: edge.type, color, style
            }
        });
    });
    
    cy = cytoscape({
        container: document.getElementById('call-graph'),
        elements,
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': 'data(bg)', 'border-width': 3, 'border-color': 'data(border)',
                    'shape': 'data(shape)', 'width': 45, 'height': 45,
                    'label': 'data(label)', 'color': '#0f172a', 'font-family': "'Plus Jakarta Sans', sans-serif",
                    'font-size': '11px', 'font-weight': '600', 'text-valign': 'bottom', 'text-margin-y': 6,
                    'text-background-color': 'white', 'text-background-opacity': 0.8, 'text-background-padding': '4px'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2.5, 'line-color': 'data(color)', 'line-style': 'data(style)',
                    'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier', 'arrow-scale': 1.2, 'opacity': 0.7
                }
            }
        ],
        layout: { name: 'breadthfirst', directed: true, spacingFactor: 1.5, padding: 50 }
    });
    
    let tooltip = null;
    cy.on('mouseover', 'node', e => {
        const d = e.target.data(), p = e.target.renderedPosition();
        if(tooltip) tooltip.remove();
        tooltip = document.createElement('div');
        tooltip.style.cssText = `position:absolute;left:${p.x+60}px;top:${p.y}px;background:white;border:1px solid ${d.border};border-radius:12px;padding:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);z-index:10000;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;color:#0f172a;`;
        tooltip.innerHTML = `<strong style="font-size:14px">${d.label}</strong><br><span style="color:#64748b">${d.type}</span>`;
        if(d.httpMethod) tooltip.innerHTML += `<br><br><span style="background:${d.bg};border:1px solid ${d.border};padding:2px 6px;border-radius:4px;font-weight:700">${d.httpMethod}</span> <code style="color:#64748b">${d.url}</code>`;
        document.getElementById('call-graph-container').appendChild(tooltip);
    }).on('mouseout', 'node', () => { if(tooltip) tooltip.remove(); });
}

function closeCallGraph() {
    document.getElementById('call-graph-tab').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn').classList.add('active');
    
    document.getElementById('call-graph-container').classList.add('hidden');
    document.getElementById('risk-cloud-chart').classList.remove('hidden');
    Plotly.Plots.resize('risk-cloud-chart');
}

function handleSearch(query) {
    if (!globalData || globalData.length === 0) return;
    
    const lowerQuery = (query || '').toLowerCase();
    
    const opacities = [];
    const sizes2D = [];
    const sizes3D = [];
    const lineColors = [];
    
    globalData.forEach(d => {
        const isMatch = !lowerQuery || 
            (d.method_name && d.method_name.toLowerCase().includes(lowerQuery)) || 
            (d.path_template && d.path_template.toLowerCase().includes(lowerQuery));
        
        if (isMatch) {
            opacities.push(0.9);
            sizes2D.push(lowerQuery ? 16 : 12); 
            sizes3D.push(lowerQuery ? 12 : 8);
            lineColors.push(lowerQuery ? '#0f172a' : 'white'); 
        } else {
            opacities.push(0.1);
            sizes2D.push(8);
            sizes3D.push(4);
            lineColors.push('transparent');
        }
    });

    try {
        Plotly.restyle('risk-cloud-chart', {
            'marker.opacity': [opacities],
            'marker.size': [sizes2D],
            'marker.line.color': [lineColors]
        });
    } catch (e) {} 

    try {
        Plotly.restyle('arch-map-chart', {
            'marker.opacity': [opacities],
            'marker.size': [sizes3D]
        });
    } catch (e) {}
}

fetchData();