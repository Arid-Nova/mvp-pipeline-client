import React from 'react';
import { NodeData } from '../models';

interface ComponentGenerateCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const ComponentGenerateCard: React.FC<ComponentGenerateCardProps> = ({ node, updateNodeData }) => {
    const rolePriorities = node.data.rolePriorities || [
                        { role: 'ADMIN', priority: 1 }, 
                        { role: 'USER', priority: 10 }
                    ];
    
    // Calculating the priorities within a 1-10 scale based on position
    const recalculatePriorities = (rolesArray: any[]) => {
        const n = rolesArray.length;
        if (n === 0) return [];
        if (n === 1) return [{ ...rolesArray[0], priority: 1 }];
        
        return rolesArray.map((r, i) => ({
            ...r,
            priority: Math.round(1 + (i / (n - 1)) * 9)
        }));
    };

    // Saving to React Flow Node State
    const saveRoles = (newRoles: any[]) => {
        updateNodeData(node.id, { rolePriorities: newRoles });
    };

    const updateRoleName = (index: number, value: string) => {
        const newRoles = [...rolePriorities];
        newRoles[index].role = value.toUpperCase().replace(/^ROLE_/i, '');
        saveRoles(newRoles);
    };

    const addRole = () => {
        saveRoles(recalculatePriorities([...rolePriorities, { role: '', priority: 0 }]));
    };

    const removeRole = (index: number) => {
        saveRoles(recalculatePriorities(rolePriorities.filter((_: any, i: number) => i !== index)));
    };

    // Fliping the priorites feature
    const reverseRoles = () => {
        const reversed = [...rolePriorities].reverse();
        saveRoles(recalculatePriorities(reversed));
    };

    // Facilitating drag and drop of roles into their desired priority
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.stopPropagation(); 
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        e.stopPropagation(); 
        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;

        const newRoles = [...rolePriorities];
        const [movedItem] = newRoles.splice(sourceIndex, 1);
        newRoles.splice(targetIndex, 0, movedItem);
        
        saveRoles(recalculatePriorities(newRoles));
    };

    return (
        <div className="space-y-3 mt-2">
            {/* Header */}
            <div className="flex justify-between items-center mb-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Role Priority</div>
                <div className="flex items-center gap-2">
                    <span className="text-[8px] text-slate-500 uppercase tracking-wider" title="Top = Highest Priority">Top=High</span>
                    <button 
                        onClick={reverseRoles}
                        className="text-[9px] flex items-center gap-1 text-slate-400 hover:text-teal-400 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-teal-700/50 px-1.5 py-0.5 rounded transition-all"
                        title="Flip Order"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        Flip Priority
                    </button>
                </div>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                {rolePriorities.map((role: any, index: number) => (
                    <div 
                        key={`role-${index}`} 
                        className="nodrag flex gap-1.5 items-center relative group bg-slate-950 border border-slate-700 rounded focus-within:border-teal-500 overflow-hidden transition-colors cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => handleDrop(e, index)}
                    >
                        {/* Drag Handle */}
                        <div className="px-1.5 py-1 text-slate-600 hover:text-teal-400 flex items-center justify-center bg-slate-900 border-r border-slate-700" title="Drag to reorder">
                            <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                        </div>
                        
                        {/* Role Input with Prefix */}
                        <span className="text-[9px] font-mono text-slate-500 select-none ml-1 pointer-events-none">
                            ROLE_
                        </span>
                        <input 
                            type="text" 
                            placeholder="ADMIN" 
                            value={role.role} 
                            // Added nodrag here as well to ensure text selection works
                            className="nodrag w-full text-[10px] bg-transparent py-1 pr-1 outline-none font-mono text-teal-400 placeholder:text-slate-700 cursor-text" 
                            onChange={(e) => updateRoleName(index, e.target.value)} 
                        />

                        {/* Remove Role Button */}
                        <button 
                            onClick={() => removeRole(index)} 
                            className={`text-slate-600 hover:text-red-400 text-xs font-bold px-2 transition-opacity ${rolePriorities.length > 1 ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
                            title="Remove Role"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
            
            {/* Add Role Button */}
            <button 
                onClick={addRole} 
                className="w-full py-1 text-[10px] text-teal-400 border border-dashed border-teal-800 rounded hover:bg-teal-900/30 transition-colors"
            >
                + Add Role
            </button>
        </div>
    );
};

