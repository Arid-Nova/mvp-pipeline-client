import React, { SetStateAction, useEffect, useState } from "react";
import { useInfoBox } from "../../hooks/useInfoBox";
import CollapsableBox from "../generic/CollapsableBox";

type Props = {
    graphData: any;
    focusNode: any;
    setFocusNode: any;
    
};

//Info box shown when you click on a link or a node
export const InfoBox = (props: Props) => {
    const { anchorPoint, show, name, type, depends, 
        setShow, dependencies, patterns, methods, 
        source, destination, parameters, entityDependencies} =
        useInfoBox(props.graphData, props.setFocusNode);

    const getColorClass = (color: string) => {
        switch (color) {
            case 'red':
            return 'bg-red-500';
            case 'green':
            return 'bg-green-500';
            case 'grey':
            return 'bg-gray-500';
            default:
            return 'bg-white'; // default background color
        }
    };
    
    // Popup for a link
    if (type == "link" || type == "sublink"){
        return (
        <ul
            className={`absolute flex-col top-[10%] left-[60%] z-50 p-4 max-h-96
                bg-white/90 text-slate-800
                rounded-xl shadow-lg backdrop-blur-sm transition-colors duration-300
                ${show ? `flex` : `hidden`}`}
            style={{ top: anchorPoint.y, left: anchorPoint.x }}
        >
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-semibold border-b border-slate-300 pb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    Link Details
                </h4>
                {type == 'link' ? (
                    <div>
                        <p><strong>Source:</strong> {source}</p>
                        <p><strong>Destination:</strong> {destination}</p>
                    </div>
                ): (
                    <div>
                        <p><strong>Parent:</strong> {source}</p>
                        <p><strong>Child:</strong> {destination}</p>
                    </div>
                )}
            </div>
            
            {type == 'link' && (
                <div className="w-full h-px bg-slate-300 my-2"></div>
            )}
            
            {type == 'link' && (
                <div className="max-h-96 w-96 overflow-y-scroll dark-scrollbar">
                    <div className="font-medium mb-2">Method Calls</div>
                    {dependencies && dependencies.length > 0 ? (
                        dependencies.map((link: any, index: number) => (
                            <CollapsableBox
                                key={index}
                                title="Method Calls"
                                svg={arrowSvg}
                                body={
                                    link.requests &&
                                    link.requests.length > 0 ? (
                                        link.requests.map((func: any, subIndex: number) => (
                                            <ul
                                                key={subIndex}
                                                className={`
                                                    mb-4 p-4 rounded-xl border border-slate-300 shadow-sm
                                                    bg-white/90 backdrop-blur-sm
                                                    ${getColorClass(func.color)}
                                                `}
                                            >
                                                {/* Header Section with Source and Destination */}
                                                <div className="flex flex-col gap-1 mb-2">
                                                    <h5 className="font-semibold text-base flex items-center gap-2">
                                                        Source: <span className="font-normal text-slate-600 break-words">{func.sourceMethod}</span>
                                                    </h5>
                                                    <h5 className="font-semibold text-base flex items-center gap-2">
                                                        Destination: <span className="font-normal text-slate-600 break-words">{func.endpointFunction}</span>
                                                    </h5>
                                                </div>
                                                
                                                <div className="w-full h-px bg-slate-300 my-3"></div>
                                                
                                                {/* Details Grid */}
                                                <div className="flex flex-col gap-3">
                                                    {func.type && (
                                                        <>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-xs text-slate-500">HTTP Method</span>
                                                                <span className="font-semibold text-sm text-slate-700">{func.type}</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-xs text-slate-500">URL</span>
                                                                <span className="font-normal text-sm break-words">{func.destinationUrl}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-xs text-slate-500">Return Type</span>
                                                        <span className="font-mono text-cyan-600 text-sm break-words">{func.msReturn ? func.msReturn : 'None'}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-xs text-slate-500">Arguments</span>
                                                        <span className="text-sm break-words">{func.argument}</span>
                                                    </div>
                                                </div>
                                            </ul>
                                        ))
                                    ) : (
                                        <div>None</div>
                                    )
                                }
                                initOpen={false}
                            />
                        ))
                    ) : (
                        <div>None</div>
                    )}
                </div>
            )} 
            
            <div className="w-full h-px bg-slate-300 my-2"></div>
            
            <button
                onClick={() => {
                    props.setFocusNode(null);
                    setShow(false);
                }}
                className="
                    mt-2 w-full rounded-xl px-4 py-2 text-center text-sm font-semibold transition-all duration-200
                    bg-slate-300 hover:bg-slate-400 text-slate-800
                "
            >
                Close Box
            </button>
        </ul>
        );
        
    }
    else if (type === "entity") {
        return (
            <ul
                className={`absolute flex-col top-[10%] left-[60%] z-50 p-4 max-h-96 w-96
                    bg-white/90 text-slate-800 rounded-xl shadow-lg backdrop-blur-sm 
                    transition-colors duration-300
                    ${show ? `flex` : `hidden`}`}
                style={{ top: anchorPoint.y, left: anchorPoint.x }}
            >
                <div className="flex flex-col gap-2">
                    <h4 className="text-lg font-semibold border-b border-slate-300 pb-2 flex items-center gap-2">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5 text-gray-400"
                            >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 3c-4.97 0-9 1.343-9 3s4.03 3 9 3 9-1.343 9-3-4.03-3-9-3zm9 3v12c0 1.657-4.03 3-9 3s-9-1.343-9-3V6m18 6c0 1.657-4.03 3-9 3s-9-1.343-9-3"
                            />
                        </svg>
                        Entity Details
                    </h4>
                    <div className="flex flex-col gap-1">
                        <p><strong>Name:</strong> {name}</p>
                    </div>
                </div>

                <div className="w-full h-px bg-slate-300 my-2"></div>
                <div className="overflow-y-auto dark-scrollbar">
                    <h5 className="font-semibold text-sm mb-2">Used By (Microservices):</h5>
                    {entityDependencies && entityDependencies.size > 0 ? (
                        Array.from(entityDependencies.entries()).map(([microserviceName, components]) => (
                            <CollapsableBox
                                key={microserviceName}
                                title={microserviceName}
                                svg={arrowSvg} 
                                body={
                                    <ul className="pl-2 pt-2 flex flex-col gap-2">
                                        {components.map(comp => (
                                            <li
                                                key={comp.nodeName}
                                                className="text-sm p-2 bg-slate-100 rounded-md flex items-center gap-3
                                                        hover:bg-slate-200 transition-colors duration-200 cursor-default"
                                            >
                                                {/* Badge for Component Type */}
                                                <span
                                                    className={`
                                                        w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-xs
                                                        ${comp.nodeType === 'controller'
                                                            ? 'bg-sky-100 text-sky-700'
                                                            : 'bg-teal-100 text-teal-700'
                                                        }
                                                    `}
                                                >
                                                    {comp.nodeType.charAt(0).toUpperCase()}
                                                </span>
                                                {/* Component Name */}
                                                <span className="font-medium text-slate-700">
                                                    {comp.displayName}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                }
                                initOpen={false} 
                            />
                        ))
                    ) : (
                        <div className="text-sm text-slate-500">Not used by any component.</div>
                    )}
                </div>

                <div className="w-full h-px bg-slate-300 my-2"></div>
                <button
                    onClick={() => {
                        props.setFocusNode(null);
                        setShow(false);
                    }}
                    className="
                        mt-2 w-full rounded-xl px-4 py-2 text-center text-sm font-semibold transition-all duration-200
                        bg-slate-300 hover:bg-slate-400 text-slate-800
                    "
                >
                    Close Box
                </button>
            </ul>
        );
    }
    // Check if type is not a microservice, which means it is a either a CONTROLLER or a SERVICE.
    else if (type != "microservice"){
        // Methods is not undefined if type is not a microservice and not a link.
        return(
        <ul
            className={`absolute flex-col top-[10%] left-[60%] z-50 p-4 max-h-96 w-96
                bg-white/90 text-slate-800 rounded-xl shadow-lg backdrop-blur-sm 
                transition-colors duration-300
                ${show ? `flex` : `hidden`}`}
            style={{ top: anchorPoint.y, left: anchorPoint.x }}
        >
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-semibold border-b border-slate-300 pb-2 flex items-center gap-2">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5 text-gray-400"
                        >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 7.5l-9-4.5-9 4.5M21 7.5v9l-9 4.5m9-13.5l-9 4.5m-9-4.5v9l9 4.5m-9-13.5l9 4.5"
                        />
                    </svg>
                    Node Details
                </h4>
                <div className="flex flex-col gap-1">
                    <p><strong>Node:</strong> {name}</p>
                    <p><strong>Type:</strong> {type}</p>
                    <p><strong>Microservice:</strong> {source}</p>
                </div>
            </div>

            <div className="w-full h-px bg-slate-300 my-2"></div>
            
            {type == 'method' ? (
                <div>
                    <div className="font-medium mb-2">Parameters:</div>
                    <div className="max-h-20 overflow-y-scroll dark-scrollbar p-4 rounded-xl border border-slate-300 shadow-sm bg-white/90 backdrop-blur-sm">
                        {parameters && parameters.length > 0 ? (
                            <span className="text-sm break-words whitespace-pre-wrap">
                                {JSON.stringify(parameters, null, 2)}
                            </span>
                        ) : (
                            <span className="text-sm text-slate-500">None</span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="max-h-96 w-96 overflow-y-scroll dark-scrollbar">
                <div className="font-medium mb-2">Methods:</div>
                    {methods && methods.length > 0 ? (
                        methods.map((method: any) => (
                            <CollapsableBox
                                key={method.id}
                                title={(method.name || method.displayName)}
                                svg={arrowSvg}
                                body={
                                    method ? (
                                        <ul
                                            className={`mb-4 p-4 rounded-xl border border-slate-300 shadow-sm
                                                bg-white/90 backdrop-blur-sm`}
                                        >
                                            <div className="flex flex-col gap-3">
                                                {method.url && method.httpMethod && (
                                                    <>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-xs text-slate-500">HTTP Method</span>
                                                            <span className="font-semibold text-sm text-slate-700">{method.httpMethod}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-xs text-slate-500">URL</span>
                                                            <span className="font-normal text-sm break-words">{method.url}</span>
                                                        </div>
                                                    </>
                                                )}
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-xs text-slate-500">Return Type</span>
                                                    <span className="font-mono text-cyan-600 text-sm break-words">{method.returnType ? method.returnType : 'None'}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-xs text-slate-500">Parameters</span>
                                                    <span className="text-sm break-words whitespace-pre-wrap">{JSON.stringify(method.parameters, null, 2)}</span>
                                                </div>
                                            </div>
                                        </ul>
                                    ) : (
                                        <div>None</div>
                                    )
                                }
                                initOpen={false}
                            />
                        ))
                    ) : (
                        <div>None</div>
                    )}
                </div>
            )}
            
            <div className="w-full h-px bg-slate-300 my-2"></div>
            
            <button
                onClick={() => {
                    props.setFocusNode(null);
                    setShow(false);
                }}
                className="
                    mt-2 w-full rounded-xl px-4 py-2 text-center text-sm font-semibold transition-all duration-200
                    bg-slate-300 hover:bg-slate-400 text-slate-800
                "
            >
                Close Box
            </button>
        </ul>

        );

    }

    // Return Microservice link for a node.
    return (
        <ul
            className={`absolute flex-col top-[10%] left-[60%] z-50 p-4 max-h-96
                bg-white/90 text-slate-800
                rounded-xl shadow-lg backdrop-blur-sm transition-colors duration-300
                ${show ? `flex` : `hidden`}`}
            style={{ top: anchorPoint.y, left: anchorPoint.x }}
        >
            <div className="flex flex-col gap-2">
                <h4 className="text-lg font-semibold border-b border-slate-300 pb-2 flex items-center gap-2">
                    MS: {name}
                </h4>
                <div className="flex flex-col gap-1">
                    <p><strong>Type:</strong> {type}</p>
                    <p><strong>Microservice:</strong> {name}</p>
                </div>
            </div>

            <div className="w-full h-px bg-slate-300 my-2"></div>

            <div className="max-h-96 w-96 overflow-y-scroll dark-scrollbar">
                <h5 className="font-semibold text-sm mt-4">Dependencies</h5>
                <div className="w-full h-px bg-slate-300 my-2"></div>
                <div className="flex flex-col gap-4">
                    {dependencies && dependencies.length > 0 ? (
                        dependencies.map((link: any, index: number) => (
                            link.target.nodeType == "microservice" && (
                                <CollapsableBox
                                    key={index}
                                    title={(link.target.displayName || link.target.nodeName)}
                                    svg={arrowSvg}
                                    body={
                                        // Dependencies are when my (a microservice) method (Caller could be in Service)
                                        // invokes an enpoint (Callee) in a differnt microservice.
                                        link.requests && link.requests.length > 0 ? (
                                            link.requests.map((func: any, subIndex: number) => (
                                                <ul
                                                    key={subIndex}
                                                    className={`mb-4 p-4 rounded-xl border border-slate-300 shadow-sm bg-white/90 backdrop-blur-sm`}
                                                >
                                                    <div className="flex flex-col gap-1 mb-2">
                                                        <h6 className="font-semibold text-xs text-gray-500 flex items-center gap-2">
                                                            Caller
                                                        </h6>
                                                        <h5 className="font-semibold text-base flex items-center gap-2">
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                strokeWidth={1.5}
                                                                stroke="currentColor"
                                                                className="w-4 h-4 text-gray-400"
                                                                >
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6.75L21.75 12l-5.25 5.25M7.5 17.25L2.25 12l5.25-5.25" />
                                                            </svg>
                                                            Service: <span className="font-normal text-slate-600 break-words">{func.className}</span>
                                                        </h5>
                                                        
                                                        <h6 className="font-semibold text-xs text-gray-500 flex items-center gap-2">
                                                            Reciever/Callee
                                                        </h6>
                                                        <h5 className="font-semibold text-base flex items-center gap-2">
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                strokeWidth={1.5}
                                                                stroke="currentColor"
                                                                className="w-4 h-4 text-gray-400"
                                                                >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                                />
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                                                                />
                                                            </svg>
                                                            Entry Point: <span className="font-normal text-slate-600 break-words">{func.endpointFunction}</span>
                                                        </h5>
                                                        <h5 className="font-semibold text-base flex items-center gap-2">
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                strokeWidth={1.5}
                                                                stroke="currentColor"
                                                                className="w-4 h-4 text-gray-400"
                                                                >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                                />
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                                                                />
                                                            </svg>
                                                            Method: <span className="font-normal text-slate-600 break-words">{func.sourceMethod}</span>
                                                        </h5>
                                                    </div>
                                                    <div className="w-full h-px bg-slate-300 my-3"></div>
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-xs text-slate-500">HTTP Method</span>
                                                            <span className="font-semibold text-sm text-slate-700">{func.type}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-xs text-slate-500">Return Type</span>
                                                            <span className="font-mono text-cyan-600 text-sm break-words">{func.msReturn ? func.msReturn : 'None'}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-xs text-slate-500">Arguments</span>
                                                            <span className="text-sm break-words">{func.argument}</span>
                                                        </div>
                                                    </div>
                                                </ul>
                                            ))
                                        ) : (
                                            <div>None</div>
                                        )
                                    }
                                    initOpen={false}
                                />
                            )
                        ))
                    ) : (
                        <div>None</div>
                    )}
                </div>
                
                <h5 className="font-semibold text-sm mt-4">Depends On</h5>
                <div className="w-full h-px bg-slate-300 my-2"></div>
                <div className="flex flex-col gap-4">
                    {depends && depends.length > 0 ? (
                        depends.map((link: any, index: number) => (
                            <CollapsableBox
                                key={index}
                                title={link.source.nodeName}
                                svg={arrowSvg}
                                body={
                                    link.requests && link.requests.length > 0 ? (
                                        link.requests.map((func: any, subIndex: number) => (
                                            <ul
                                                key={subIndex}
                                                className={`mb-4 p-4 rounded-xl border border-slate-300 shadow-sm bg-white/90 backdrop-blur-sm`}
                                            >
                                                <h6 className="font-semibold text-xs text-gray-500 flex items-center gap-2">
                                                    Caller:
                                                </h6>
                                                <div className="flex flex-col gap-1 mb-2">
                                                    <h5 className="font-semibold text-base flex items-center gap-2">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="w-4 h-4 text-gray-400"
                                                            >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6.75L21.75 12l-5.25 5.25M7.5 17.25L2.25 12l5.25-5.25" />
                                                        </svg>
                                                        Service: <span className="font-normal text-slate-600 break-words">{func.className}</span>
                                                    </h5>

                                                    <h6 className="font-semibold text-xs text-gray-500 flex items-center gap-2">
                                                        Callee/This Microservice:
                                                    </h6>
                                                    <h5 className="font-semibold text-base flex items-center gap-2">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="w-4 h-4 text-gray-400"
                                                            >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                                                            />
                                                        </svg>
                                                        Entry Point: <span className="font-normal text-slate-600 break-words">{func.endpointFunction}</span>
                                                    </h5>
                                                    <h5 className="font-semibold text-base flex items-center gap-2">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="w-4 h-4 text-gray-400"
                                                            >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                                                            />
                                                        </svg>
                                                        Method: <span className="font-normal text-slate-600 break-words">{func.sourceMethod}</span>
                                                    </h5>
                                                    
                                                </div>
                                                <div className="w-full h-px bg-slate-300 my-3"></div>
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-xs text-slate-500">HTTP Method</span>
                                                        <span className="font-semibold text-sm text-slate-700">{func.type}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-xs text-slate-500">Return Type</span>
                                                        <span className="font-mono text-cyan-600 text-sm break-words">{func.msReturn ? func.msReturn : 'None'}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-xs text-slate-500">Arguments</span>
                                                        <span className="text-sm break-words">{func.argument}</span>
                                                    </div>
                                                </div>
                                            </ul>
                                        ))
                                    ) : (
                                        <div>None</div>
                                    )
                                }
                                initOpen={false}
                            />
                        ))
                    ) : (
                        <div>None</div>
                    )}
                </div>
                
                <h5 className="font-semibold text-sm mt-4">Anti-Patterns</h5>
                <div className="w-full h-px bg-slate-300 my-2"></div>
                <div className="flex flex-col gap-4">
                    {patterns && patterns.length > 0 ? (
                        patterns.map((pattern: any, index: number) => (
                            <CollapsableBox
                                key={index}
                                title={pattern.type}
                                svg={arrowSvg}
                                body={
                                    <p className="p-2">
                                        <span className="font-medium text-xs text-slate-500">Threshold:</span>
                                        <span className="text-sm">{pattern.threshold}</span>
                                    </p>
                                }
                                initOpen={false}
                            />
                        ))
                    ) : (
                        <div>None</div>
                    )}
                </div>
            </div>
            <div className="w-full h-px bg-slate-300 my-2"></div>

            <button
                onClick={() => {
                    props.setFocusNode(null);
                    setShow(false);
                }}
                className="
                    mt-2 w-full rounded-xl px-4 py-2 text-center text-sm font-semibold transition-all duration-200
                    bg-slate-300 hover:bg-slate-400 text-slate-800
                "
            >
                Close Box
            </button>
        </ul>
    );
};

const arrowSvg = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="h-6 w-6"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
        />
    </svg>
);
