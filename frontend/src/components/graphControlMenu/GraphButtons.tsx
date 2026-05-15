import { saveAs } from "file-saver";
import React, { useState } from "react";
import { reset } from "../../utils/graphFunctions";
import axios from "axios";

type ButtonProps = {
    onClick: any;
    children: any;
};

/**
 * A styled graph button with a function to interface with the graph.
 * @param {Object} props the props passed to this object
 * @param {Function} props.onClick on click function
 * @param {String} props.children text to display
 * @returns {React.Component} A single, functional button for the graph
 */
const GraphButton: React.FC<ButtonProps> = ({ onClick, ...props }) => {
    return (
        <button
            className={`rounded-xl px-4 py-2 text-center text-base font-semibold transition-all duration-200
            bg-slate-800/70 border border-slate-700
            text-white hover:bg-slate-700 hover:border-slate-600
            focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            onClick={onClick}
        >
            {props.children}
        </button>
    );
};

/**
 * Buttons to interact with the force graph.
 *
 * @param {Object} props The props passed to this object
 * @param {React.MutableRefObject<import("react-force-graph-3d").ForceGraphMethods>} props.graphRef Reference to the internal force graph to access methods/camera
 * @returns {React.Component} The buttons
 */

type Props = {
    graphRef: any;
    graphData: any;
    setGraphData: any;
    initCoords: any;
    initRotation: any;
    is3d: any;
};

const GraphButtonMenu: React.FC<Props> = ({
    graphRef,
    graphData,
    setGraphData,
    initCoords,
    initRotation,
    is3d,
}) => {
    let [numScreenshots, setNumScreenshots] = useState(0);
    const [trackMenu] = useState<any>(null);

    /** @TODO idk what the track is or how to toggle it */
    function toggleTrack() {
        if (trackMenu.checked) {
            trackMenu.checked = false;
        } else {
            trackMenu.checked = true;
        }
    }

    function exportGraph() {
        exportToJsonFile(graphData);
    }

    function replacer(key: any, value: any) {
        if (key === "__threeObj") return undefined;
        else if (key === "__lineObj") return undefined;
        else if (key === "__arrowObj") return undefined;
        else if (key === "__curve") return undefined;
        else if (key === "index") return undefined;
        else if (key === "source") return value.nodeName;
        else if (key === "target") return value.nodeName;
        else return value;
    }

    function exportToJsonFile(jsonData: any) {
        let dataStr = JSON.stringify(
            Object.assign({}, {"graphName": "test"}, jsonData, graphRef.current.cameraPosition()),
            replacer
        );

        //let dataStr2 = JSON.stringify(Graph.cameraPosition());
        let dataUri =
            "data:application/json;charset=utf-8," +
            encodeURIComponent(dataStr);

        let exportFileDefaultName = "data-out.json";

        let linkElement = document.createElement("a");
        linkElement.setAttribute("href", dataUri);
        linkElement.setAttribute("download", exportFileDefaultName);
        linkElement.click();
    }

    function save() {
        let dataStr = JSON.stringify(
            Object.assign({}, {"graphName": "test"}, graphData, graphRef.current.cameraPosition()),
            replacer
        );

        var config = {
            method: 'post',
            // Uses the default axios baseURL configured in setupAxios()
            // (backend service, either http://localhost:8080 or /api/backend).
            url: '/graph/instance',
            headers: {
                'Content-Type': 'application/json'
            },
            data : dataStr
        };

        axios(config)
            .then(function (response) {
                console.log(JSON.stringify(response.data));
            })
            .catch(function (error) {
                console.log(error);
            });


    }

    function delay(time: any) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    function importGraph() {
        let input = document.createElement("input");
        input.type = "file";

        input.onchange = (e: any) => {
            let file = e.target.files[0];

            // setting up the reader
            let reader = new FileReader();
            reader.readAsText(file, "UTF-8");

            // here we tell the reader what to do when it's done reading...
            reader.onload = (readerEvent: any) => {
                let content = readerEvent.target.result; // this is the content!
                let parsedData = JSON.parse(content);
                setGraphData(parsedData);
                graphRef.current.cameraPosition(
                    { x: parsedData.x, y: parsedData.y, z: parsedData.z }, // new position
                    { x: 0, y: 0, z: 0 }, //parsedData.lookAt, // lookAt ({ x, y, z })
                    0 // ms transition duration
                );
                delay(150).then(() => {
                    reset(graphRef);
                });
            };
        };

        input.click();
    }

    /**
     * @TODO this doesn't seem to actually put the graph upright
     */
    function forceReset() {
        if (is3d) {
            graphRef.current.refresh();
            graphRef.current.cameraPosition(
                initCoords, // new position
                { x: 0, y: 0, z: 0 }, // lookAt ({ x, y, z })
                2000 // ms transition duration
            );
        } else {
            graphRef.current.zoom(1, 2000);
            graphRef.current.centerAt(0, 0, 2000);
        }

        // This doesn't work either
        //graphRef.current.camera().applyQuaternion(initRotation);
        //graphRef.current.refresh();
    }

    function downloadIR() {
        const cleanData = {
            nodes: graphData.nodes,
            links: graphData.links
        };

        const dataStr = JSON.stringify(cleanData, replacer, 2);
        
        const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
        saveAs(blob, "cimet_ir.json");
    }

    function screenshotGraph() {
        const now = new Date();
        window.requestAnimationFrame(() => {
            window.cancelAnimationFrame(0);
            graphRef.current.renderer().domElement.toBlob(function (blob: any) {
                saveAs(
                    blob,
                    `3d_Visualizer_${now.toLocaleDateString()}-${numScreenshots}}`
                );
            });
            setNumScreenshots(++numScreenshots);
        });
    }

    return (
        <div className="flex flex-col gap-2 w-full h-fit">
          
            <GraphButton onClick={exportGraph}>Export</GraphButton>
            <GraphButton onClick={downloadIR}>Download Graph JSON</GraphButton>
            <GraphButton onClick={screenshotGraph}>Capture Graph</GraphButton>
            {/*<GraphButton onClick={toggleTrack}>Track Menu</GraphButton>*/}
            <GraphButton onClick={forceReset}>Reset</GraphButton>
        </div>
    );
};

export default GraphButtonMenu;
