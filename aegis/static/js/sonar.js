// Fetch data from Flask API
fetch('/api/sonardata')
    .then(response => response.json())
    .then(data => {
        // Hide loading, show dashboard
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        // Update stat cards
        document.getElementById('total-vulns').textContent = data.total;
        document.getElementById('critical-count').textContent = data.critical_count;
        document.getElementById('tech-debt').textContent = data.effort_hours + 'h';
        document.getElementById('file-count').textContent = data.top_files.length;
        
        // Severity Chart
        const severityCtx = document.getElementById('severityChart').getContext('2d');
        new Chart(severityCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(data.severity_count),
                datasets: [{
                    data: Object.values(data.severity_count),
                    backgroundColor: ['#d69e2e', '#dd6b20', '#c53030', '#742a2a']
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
        
        // Impact Chart
        const impactCtx = document.getElementById('impactChart').getContext('2d');
        new Chart(impactCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(data.impact_count),
                datasets: [{
                    label: 'Issues',
                    data: Object.values(data.impact_count),
                    backgroundColor: ['#68d391', '#f6ad55', '#fc8181', '#742a2a']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        
        // Rules Table
        const rulesBody = document.getElementById('rules-body');
        Object.entries(data.rule_breakdown).forEach(([rule, info]) => {
            const row = `
                <tr>
                    <td><code>${rule}</code></td>
                    <td>${info.message}</td>
                    <td style="text-align: center; font-weight: 600;">${info.count}</td>
                    <td style="text-align: center;">
                        <span class="badge ${info.severity.toLowerCase()}">${info.severity}</span>
                    </td>
                </tr>
            `;
            rulesBody.innerHTML += row;
        });
        
        // Top Files
        const filesList = document.getElementById('files-list');
        data.top_files.forEach(([file, count]) => {
            const item = `
                <div class="file-item">
                    <span class="file-name">${file}</span>
                    <span class="issue-count">${count} issues</span>
                </div>
            `;
            filesList.innerHTML += item;
        });
        
        // Key Findings
        const findings = document.getElementById('key-findings');
        const findingsList = [
            `<strong>${data.rule_breakdown['javasecurity:S5145']?.count || 0} log injection vulnerabilities</strong> - User-controlled data being logged without sanitization`,
            `<strong>${data.rule_breakdown['java:S4684']?.count || 0} critical issues</strong> - Persistent entities used as request mapping arguments`,
            `<strong>${data.rule_breakdown['javasecurity:S7044']?.count || 0} server-side traversal</strong> - URLs constructed from user-controlled data`,
            `<strong>${data.rule_breakdown['java:S6437']?.count || 0} hard-coded credentials</strong> - Passwords found in source code (BLOCKER severity)`
        ];
        
        findingsList.forEach(finding => {
            findings.innerHTML += `<li>${finding}</li>`;
        });
    })
    .catch(error => {
        document.getElementById('loading').innerHTML = '<p style="color: red;">Error loading data: ' + error + '</p>';
    });