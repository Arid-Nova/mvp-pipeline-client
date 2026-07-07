export const countAntiPatterns = (obj: any): Record<string, number> => {
    const counts: Record<string, number> = {};
    
    const traverse = (node: any) => {
        if (!node) return;
        if (typeof node === 'object') {
            if (node.antiPattern && typeof node.antiPattern === 'string') {
                counts[node.antiPattern] = (counts[node.antiPattern] || 0) + 1;
            }
            if (Array.isArray(node.antiPatterns)) {
                node.antiPatterns.forEach((ap: string) => {
                    counts[ap] = (counts[ap] || 0) + 1;
                });
            }
            Object.values(node).forEach(traverse);
        }
    };
    
    traverse(obj);
    return counts;
};