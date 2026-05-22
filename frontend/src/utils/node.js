"use client"
import * as THREE from "three";
import { useLocation } from 'react-router-dom';
import Menu from "../components/graph/RightClickNodeMenu";
import { InfoBox } from "../components/graph/NodeInfoBox";
import React, { useEffect, useRef, useState } from "react";
import GraphWrapper from "../components/graph/GraphWrapper";
import { setupAxios, setupLogger } from "./axiosSetup";

import ForceGraph3D from "react-force-graph-3d";

export default function Node() {
  const location = useLocation();
  const data = JSON.parse(location.state);
  const graphRef = useRef();
  const [search, setSearch] = useState("");
  const [value, setValue] = useState(8);
  const [initCoords, setInitCoords] = useState(null);
  const [initRotation, setInitRotation] = useState(null);
  const [graphData, setGraphData] = useState(data[0]);
  const [is3d, setIs3d] = useState(true);
  const [antiPattern, setAntiPattern] = useState(false);
  const [selectedAntiPattern, setSelectedAntiPattern] = useState("none");
  const [max, setMax] = useState(6);
  const [color, setColor] = useState("dark-default");
  const ref = useRef < HTMLDivElement > (null);
  const [isDark, setIsDark] = useState(true);
  const [graphName, setGraphName] = useState("test");
  const [graphTimeline, setGraphTimeline] = useState(null);
  const [currentInstance, setCurrentInstance] = useState(null);
  const [defNodeColor, setDefNodeColor] = useState(false);
  const [trackNodes, setTrackNodes] = useState([]);
  const [focusNode, setFocusNode] = useState();
  const microserviceColors = data[1];
  const endpointCalls = data[2];

  return (
    <div className={`max-w-full min-h-screen max-h-screen overflow-clip ${isDark ? `bg-gray-900` : `bg-gray-100`
      }`}>

      <GraphWrapper
        height={ref?.current?.clientHeight ?? 735}
        width={ref?.current?.clientWidth ?? 1710}
        search={search}
        threshold={value}
        graphRef={graphRef}
        graphData={graphData}
        setInitCoords={setInitCoords}
        setInitRotation={setInitRotation}
        is3d={is3d}
        antiPattern={antiPattern}
        colorMode={color}
        defNodeColor={defNodeColor}
        setDefNodeColor={setDefNodeColor}
        setGraphData={setGraphData}
        isDarkMode={isDark}
        selectedAntiPattern={selectedAntiPattern}
        trackNodes={trackNodes}
        focusNode={focusNode}
        endpointCalls={endpointCalls}
      />

      <Menu trackNodes={trackNodes} setTrackNodes={setTrackNodes} />

      <InfoBox
        graphData={graphData}
        focusNode={focusNode}
        setFocusNode={setFocusNode}
      />
      <Legend microservices={microserviceColors} />
    </div>
  );
}

function Legend(microservices) {
  let data = microservices["microservices"];
  let service = { "nodes": [{ "nodeName": "Sphere", "type": "SERVICE" }], "links": [] };
  let controller = { "nodes": [{ "nodeName": "Box", "type": "CONTROLLER" }], "links": [] };
  let repository = { "nodes": [{ "nodeName": "Cone", "type": "REPOSITORY" }], "links": [] };
  let entity = { "nodes": [{ "nodeName": "Cylinder", "type": "ENTITY" }], "links": [] };
  const [isVisible, setIsVisible] = useState(true);
  const serviceRef = useRef();
  const controllerRef = useRef();
  const repositoryRef = useRef();
  const entityRef = useRef();

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  }

  return (
    <div style={{
      display: "flex",
      overflow: "auto",
      flexDirection: "column",
      alignItems: "flex-end",
      position: "absolute",
      top: "20px",
      right: "20px",
      gap: "10px",
      font: "100px",
      alignItems: 'center',
      justifyContent: 'center',
      width: '300px'

    }}>
      <button 
        onClick={(e) => {
          e.stopPropagation(); 
          toggleVisibility();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleVisibility();
        }}
        style={{
          backgroundColor: "lightblue",
          color: 'black',
          border: 'none',
          padding: '10px 15px',
          cursor: 'pointer',
          borderRadius: '5px',
          fontSize: '16px'
        }}>
        {isVisible ? 'Hide' : 'Show'}
      </button>

      {isVisible && (
        <>
          <div
            style={{
              fontSize: "20px",
              padding: "10px",
              backgroundColor: "lightblue",
              border: "1px solid blue",
              width: "300px",
              maxHeight: "1000px",
              textAlign: "center",
            }}
          >
            <h3 style={{ margin: '0 0 10px' }}>Legend</h3>
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '2px' }}>
                Service:
                <ForceGraph3D
                  ref={serviceRef}
                  graphData={service}
                  width={200}
                  height={150}
                  backgroundColor={"rgba(255,255,255,255)"}
                  nodeThreeObject={(node) => {
                    const nodes = new THREE.Mesh(
                      new THREE.SphereGeometry(50),
                      new THREE.MeshLambertMaterial({
                        transparent: true,
                        opacity: 0.75,
                        color: 'rgb(20,40,0)',
                      })

                    );
                    return nodes;

                  }
                  }
                >

                </ForceGraph3D>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '2px' }}>
                Controller:
                <ForceGraph3D
                  ref={controllerRef}
                  graphData={controller}
                  width={200}
                  height={150}
                  backgroundColor={"rgba(255,255,255,255)"}
                  nodeThreeObject={(node) => {
                    const nodes = new THREE.Mesh(
                      new THREE.BoxGeometry(50, 50, 50),
                      new THREE.MeshLambertMaterial({
                        transparent: true,
                        opacity: 0.75,
                        color: 'rgb(20,40,0)',
                      })

                    );
                    return nodes;

                  }
                  }
                >

                </ForceGraph3D>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '2px' }}>
                Repository:
                <ForceGraph3D
                  ref={repositoryRef}
                  graphData={repository}
                  width={200}
                  height={150}
                  backgroundColor={"rgba(255,255,255,255)"}
                  nodeThreeObject={(node) => {
                    const nodes = new THREE.Mesh(
                      new THREE.ConeGeometry(50, 75),
                      new THREE.MeshLambertMaterial({
                        transparent: true,
                        opacity: 0.75,
                        color: 'rgb(20,40,0)',
                      })

                    );
                    return nodes;

                  }
                  }
                  onNodeDragEnd={(node) => {
                    if (node.x && node.y && node.z) {
                      node.fx = node.x;
                      node.fy = node.y;
                      node.fz = node.z;
                    }
                  }}
                >

                </ForceGraph3D>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '2px' }}>
                Entity:
                <ForceGraph3D
                  ref={entityRef}
                  graphData={entity}
                  width={200}
                  height={150}
                  backgroundColor={"rgba(255,255,255,255)"}
                  nodeThreeObject={(node) => {
                    const nodes = new THREE.Mesh(
                      new THREE.CylinderGeometry(35, 35, 75),
                      new THREE.MeshLambertMaterial({
                        transparent: true,
                        opacity: 0.75,
                        color: 'rgb(20,40,0)',
                      })

                    );
                    return nodes;

                  }
                  }
                  onNodeDragEnd={(node) => {
                    if (node.x && node.y && node.z) {
                      node.fx = node.x;
                      node.fy = node.y;
                      node.fz = node.z;
                    }
                  }}
                >

                </ForceGraph3D>
              </li>

            </ul>
          </div>
          <div
            style={{
              display: "flex",
              overflow: 'auto',
              flexDirection: "column",
              fontSize: "20px",
              padding: "10px",
              backgroundColor: "lightblue",
              border: "1px solid blue",
              width: "300px",
              maxHeight: "250px",
              textAlign: "center",
            }}
          >
            Microservices
            {Object.entries(data).map(([name, color], index) => (
              <li
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '15px',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    backgroundColor: color,
                    marginRight: '10px',
                    border: '1px solid #000',
                  }}
                ></span>
                {name}
              </li>
            ))}
          </div>
          <div
            style={{
              fontSize: "20px",
              padding: "10px",
              backgroundColor: "lightblue",
              border: "1px solid blue",
              width: "300px",
              maxHeight: "250px",
              textAlign: "center",
            }}
          >
            <ul>
              <li>
                Direct Call: ={'>'}

              </li>
              <li>
                Endpoint Call: --{'>'}
              </li>
            </ul>

          </div>

        </>
      )}

    </div>
  );
};