import { MatrixData } from "../components/pipeline/models";

export const calculateMatrixData = (
    payload: any, 
    irPayload: any, 
    targetedServices: string[]
): MatrixData => {
    if (!payload) return { services: [], links: {}, impacts: {}, riskFactors: {}, centralities: {} };

    // 1. Extracting the microservices heuristically
    const impactServices = new Set<string>();
    payload.changes?.forEach((change: any) => {
         const m = change.path?.match(/^\/?([^\/]+)\//);
         if (m) impactServices.add(m[1]);
    });

    const servicesSet = new Set<string>([...targetedServices, ...Array.from(impactServices)]);
    const services = Array.from(servicesSet);

    const links: Record<string, Record<string, string>> = {};
    const impacts: Record<string, Record<string, number>> = {};

    // 2. Building baseline topology 
    services.forEach((source, i) => {
        links[source] = {};
        impacts[source] = {};
        services.forEach((target, j) => {
            impacts[source][target] = 0; 
            if (source === target) {
                links[source][target] = 'none';
                return;
            }
            const hash = (source.length + target.length + i + j) % 10;
            if (hash < 4 || i === 0 || j === 0) {
                links[source][target] = 'maintained';
            } else {
                links[source][target] = 'none';
            }
        });
    });

    // 3. Extracting the centrality / complexity parameters from IR
    const centralities: Record<string, number> = {};
    services.forEach(s => centralities[s] = 1.0); 
    
    if (irPayload?.microservices) {
        irPayload.microservices.forEach((ms: any) => {
            if (services.includes(ms.name)) {
                // Heuristic: Centrality scales with the number of API controllers it exposes
                const ctrlCount = ms.controllers?.length || 0;
                centralities[ms.name] = 1.0 + (ctrlCount * 0.1);
            }
        });
    }

    // 4. Categorizing semantic change & risk factors 
    const serviceChanges: Record<string, Set<string>> = {};
    const serviceVolatility: Record<string, number> = {};
    const riskFactors: Record<string, Set<string>> = {};

    payload.changes?.forEach((change: any) => {
        const m = change.path?.match(/^\/?([^\/]+)\//);
        if (!m) return;
        const source = m[1];
        
        if (!serviceChanges[source]) serviceChanges[source] = new Set();
        if (!serviceVolatility[source]) serviceVolatility[source] = 0;
        if (!riskFactors[source]) riskFactors[source] = new Set();

        serviceChanges[source].add(change.changeType);

        const pathLower = (change.path || '').toLowerCase();
        let semanticWeight = 1;

        // Following are heuristics risk values.
        // These are not absolute but meant to provide relative risk scoring for the heatmap.
        // 1. Configuraiton change risks
        if (pathLower.includes('pom.xml') || pathLower.includes('.yml') || pathLower.includes('.properties')) {
            semanticWeight = 5.0; 
            riskFactors[source].add('Config/Infra Changes');
        } 
        // 2. API contract change risks
        else if (pathLower.includes('controller') || pathLower.includes('endpoint')) {
            semanticWeight = 4.0; 
            riskFactors[source].add('API/Contract Changes');
        } 
        // 3. Core service logic change risks
        else if (pathLower.includes('service') || pathLower.includes('impl')) {
            semanticWeight = 3.0; 
            riskFactors[source].add('Core Logic Overhaul');
        } 
        // 4. Data model change risks
        else if (pathLower.includes('entity') || pathLower.includes('repository')) {
            semanticWeight = 2.0; 
            riskFactors[source].add('Data Model Shifts');
        }

        if (change.changeType === 'DELETE') {
            semanticWeight *= 3.0;
            riskFactors[source].add('Severe Deletions');
        } else if (change.changeType === 'MODIFY') {
            semanticWeight *= 2.0;
        }

        serviceVolatility[source] += semanticWeight;

        // Granular sub-components 
        if (change.componentDeltas) {
            change.componentDeltas.forEach((cd: any) => {
                const cdMult = cd.changeType === 'DELETE' ? 1.5 : (cd.changeType === 'MODIFY' ? 1.0 : 0.5);
                serviceVolatility[source] += cdMult;
            });
        }
    });

    // Normalize volatility (Capped at 1.0, assuming a raw score of 20+ is extremely chaotic)
    const normalizedVolatility: Record<string, number> = {};
    services.forEach(svc => {
        const raw = serviceVolatility[svc] || 0;
        normalizedVolatility[svc] = Math.min(1.0, raw / 20.0);
    });

    // 5. Applying delta to the matrix connections
    services.forEach(source => {
        if (serviceChanges[source]) {
            const changes = serviceChanges[source];
            const hasDelete = changes.has('DELETE');
            const hasModify = changes.has('MODIFY');
            const hasAdd = changes.has('ADD');

            services.forEach(target => {
                if (source === target) return;

                if (hasDelete && links[source][target] === 'maintained') {
                    links[source][target] = 'removed';
                } else if (hasModify && links[source][target] === 'maintained') {
                    links[source][target] = 'changed';
                } else if (hasAdd && links[source][target] === 'none') {
                    if ((source.length + target.length) % 3 === 0) links[source][target] = 'added';
                }
            });
        }
    });

    // 6. Calculating the final heatmap impact scores
    services.forEach(source => {
        services.forEach(target => {
            if (source === target) return;
            
            const linkStatus = links[source][target];
            const targetVol = normalizedVolatility[target] || 0;
            const sourceVol = normalizedVolatility[source] || 0;
            const targetCent = centralities[target] || 1.0;

            let score = 0;
            
            // Each of the following logic is also heuritic and not meant to be final 
            // This is why the card data is only a summary to guide pipeline construction.
            if (linkStatus === 'removed') {
                // Heuristic: Severed dependencies are critical, scales with source stability
                score = 0.75 + (sourceVol * 0.25); 
            } else if (linkStatus === 'changed') {
                // Heuristic: Modified dependencies are amplified by the target's internal chaos & centrality
                score = 0.4 + (targetVol * 0.4 * targetCent); 
            } else if (linkStatus === 'added') {
                // Heuristic: New integrations carry moderate adoption risk
                score = 0.3 + (targetVol * 0.3); 
            } else if (linkStatus === 'maintained') {
                // Heuristic: A visually "untouched" link becomes highly risky if the target is chaotic internally
                if (targetVol > 0) {
                    score = 0.15 + (targetVol * 0.7 * targetCent);
                }
            }

            impacts[source][target] = Math.min(1.0, score);
        });
    });

    return { services, links, impacts, riskFactors, centralities };
};