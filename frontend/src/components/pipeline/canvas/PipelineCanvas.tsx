import React from 'react';
import { NodeData, Connection, CardType } from '../models';
import { CARD_CONFIG, VALID_CONNECTIONS } from '../pipelineConfig'; 
import { CanvasFooter } from '../../generic/CanvasFooter'; 

interface PipelineCanvasProps {
    canvasRef: React.RefObject<HTMLDivElement>;
    scale: number;
    offset: { x: number; y: number };
    nodes: NodeData[];
    connections: Connection[];
    isLinking: string | null;
    setIsPanning: (panning: boolean) => void;
    handleCanvasDragOver: (e: React.DragEvent) => void;
    handleCanvasDrop: (e: React.DragEvent) => void;
    handleWheel: (e: React.WheelEvent) => void;
    handleCanvasMouseDown: (e: React.MouseEvent) => void;
    handleCanvasMouseMove: (e: React.MouseEvent) => void;
    deleteConnection: (id: string) => void;
    handleNodeDragStart: (e: React.DragEvent, id: string) => void;
    runFromNode: (id: string) => void;
    handleLinkClick: (id: string, type: string) => void;
    deleteNode: (id: string) => void;
    renderCardContent: (node: NodeData) => React.ReactNode;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onTouchCancel: (e: React.TouchEvent) => void;
    handleNodeTouchStart: (e: React.TouchEvent, id: string) => void;
}

export const PipelineCanvas: React.FC<PipelineCanvasProps> = ({
    canvasRef,
    scale,
    offset,
    nodes,
    connections,
    isLinking,
    setIsPanning,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleWheel,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    deleteConnection,
    handleNodeDragStart,
    runFromNode,
    handleLinkClick,
    deleteNode,
    renderCardContent,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    handleNodeTouchStart
}) => {
    const sourceNode = isLinking ? nodes.find(n => n.id === isLinking) : null;
    const allowedTargets = sourceNode ? (VALID_CONNECTIONS[sourceNode.type] || []) : [];

    return(
        <div 
            ref={canvasRef}
            className="tour-pipeline-canvas flex-1 relative overflow-hidden bg-slate-950 cursor-grab active:cursor-grabbing"
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
            onWheel={handleWheel}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
            onPointerDown={handleCanvasMouseDown as any}
            onPointerMove={handleCanvasMouseMove as any}
            onPointerUp={() => setIsPanning(false)}
            onPointerLeave={() => setIsPanning(false)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
        >
            <div 
                id="canvas-grid"
                className="absolute inset-0 opacity-20 pointer-events-auto"
                style={{
                    backgroundImage: `radial-gradient(circle, #475569 1px, transparent 1px)`,
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`
                }}
            />

            {/* Transformation Layer */}
            <div 
                style={{ 
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: '0 0'
                }}
                className="absolute inset-0 pointer-events-none"
            >
                <div className="pointer-events-auto">
                    {/* Connections Layer */}
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                        {connections.map(conn => {
                            const start = nodes.find(n => n.id === conn.source);
                            const end = nodes.find(n => n.id === conn.target);
                            if (!start || !end) return null;
                            
                            const startX = start.x + 160; 
                            const startY = start.y + 60;
                            const endX = end.x;
                            const endY = end.y + 60;

                            return (
                                <g key={conn.id}>
                                    <path 
                                        d={`M ${startX} ${startY} C ${startX + 80} ${startY}, ${endX - 80} ${endY}, ${endX} ${endY}`}
                                        stroke="#64748b" 
                                        strokeWidth="2" 
                                        fill="none" 
                                        strokeDasharray="8,4"
                                        className="animate-[dash_30s_linear_infinite]"
                                    />
                                    <circle cx={(startX + endX)/2} cy={(startY+endY)/2} r="8" fill="#1e293b" stroke="#ef4444" strokeWidth={1} className="pointer-events-auto cursor-pointer hover:fill-red-900" onClick={() => deleteConnection(conn.id)} />
                                    <text x={(startX + endX)/2} y={(startY+endY)/2} dy="3" textAnchor="middle" fill="#ef4444" fontSize="10" className="pointer-events-none font-bold">×</text>
                                </g>
                            );
                        })}
                        <style>{`@keyframes dash { to { stroke-dashoffset: -1000; } }`}</style>
                    </svg>

                    {/* Nodes Layer */}
                    {nodes.map(node => {
                        const config = CARD_CONFIG[node.type];
                        const isSource = isLinking === node.id;

                        const isValidTarget = isLinking ? allowedTargets.includes(node.type as any) : true;
                        const linkCursorClass = (isLinking && !isValidTarget && !isSource) 
                            ? "cursor-not-allowed opacity-50 grayscale-[50%]" 
                            : "";
                        
                        return (
                            <div
                                key={node.id}
                                draggable
                                onDragStart={(e) => handleNodeDragStart(e, node.id)}
                                onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
                                className={`
                                    absolute rounded-xl border backdrop-blur-md transition-all duration-300 ease-in-out
                                    ${node.data?.isExpanded ? 'w-[650px]' : 'w-80'}
                                    ${config.color} 
                                    touch-none
                                    ${isSource ? 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]' : 'ring-1 ring-white/10 shadow-2xl'}
                                    ${node.status === 'running' ? 'ring-2 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]' : ''}
                                    ${node.status === 'failed' ? 'ring-2 ring-red-500 bg-red-900/40' : ''}
                                    ${linkCursorClass}
                                `}
                                style={{ left: node.x, top: node.y, zIndex: node.data?.isExpanded ? 50 : 10 }}
                            >
                                {/* Card Header */}
                                <div className={`p-3 border-b border-white/10 flex items-center justify-between bg-slate-900/60 rounded-t-xl handle ${isLinking && !isValidTarget && !isSource ? 'cursor-not-allowed' : 'cursor-move'}`}>
                                    <div className="flex items-center gap-2">
                                        {config.icon}
                                        <span className="font-bold text-sm text-white tracking-tight">{config.title}</span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {/* Run Button */}
                                        {node.status !== 'running' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    runFromNode(node.id);
                                                }}
                                                onTouchEnd={(e) => { 
                                                    e.preventDefault(); 
                                                    e.stopPropagation(); 
                                                    runFromNode(node.id); 
                                                }}
                                                disabled={isLinking !== null} 
                                                className="p-2 rounded-full hover:bg-green-500/20 text-slate-400 hover:text-green-400 transition-all border border-transparent hover:border-green-500/30 active:scale-90 group/run flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Run this step"
                                            >
                                                {/* Large, Rounded-Corner Play Icon */}
                                                <svg 
                                                    className="w-7 h-7 fill-current ml-1" 
                                                    viewBox="0 0 24 24" 
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <path 
                                                        d="M8.5 6.1C7.8 5.7 7 6.2 7 7V17c0 .8.8 1.3 1.5.9l8.6-5c.7-.4.7-1.4 0-1.8l-8.6-5z" 
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinejoin="round" 
                                                    />
                                                </svg>
                                            </button>
                                        )}

                                        {/* Link Button */}
                                        <button 
                                            title="Link to..."
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLinkClick(node.id, node.type);
                                            }}
                                            onTouchEnd={(e) => { 
                                                e.preventDefault(); 
                                                e.stopPropagation(); 
                                                handleLinkClick(node.id, node.type); 
                                            }}
                                            className={`p-1.5 rounded-lg transition-colors ${isLinking === node.id ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400 hover:text-white'} ${(isLinking && !isValidTarget && !isSource) ? 'pointer-events-none' : ''}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                        </button>

                                        {/* Delete Button */}
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteNode(node.id);
                                            }}
                                            onTouchEnd={(e) => { 
                                                e.preventDefault(); 
                                                e.stopPropagation(); 
                                                deleteNode(node.id); 
                                            }}
                                            disabled={isLinking !== null} 
                                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Card Body */}
                                <div className={`p-4 bg-slate-900/90 rounded-b-xl min-h-[100px] ${(isLinking && !isValidTarget && !isSource) ? 'pointer-events-none' : ''}`}>
                                    <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider font-bold">{config.description}</p>
                                    
                                    {renderCardContent(node)}

                                    {/* Logs */}
                                    {node.logs.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-slate-700/50 max-h-24 overflow-y-auto dark-scrollbar bg-black/20 rounded p-2">
                                            {node.logs.map((log, i) => (
                                                <div key={i} className="text-[10px] font-mono text-slate-300 truncate">
                                                    <span className="text-indigo-400 mr-1">›</span>{log}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                </div>
            </div>

            <CanvasFooter scale={scale} />
        </div>
    );
};