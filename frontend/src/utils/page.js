"use client"
import { useState } from "react";
import getGraphData from "../parsers/getData";
import { useNavigate } from "react-router-dom";
import getConnections from "./createConnections"

function getData(data) {

  let microservices = data["nodes"];
  let names = [];
  let indices = [];
  for (let i = 0; i < microservices.length; i++) {
    let microservice = microservices[i];
    names.push(microservice["nodeName"]);
    indices.push(i);
  }
  return [names, indices];
}

//The filter box that appears on the left side of the website, 
//listing all of the microservices currently displayed. 
//When you click filter it will then show the component view of those microservices
export default function FilterBox(values) {
  const graphData = values["graphData"];
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const arr = getData(graphData);
  const [nodes, setNodes] = useState(arr[0])
  const [selectedIds, setSelectedIds] = useState(arr[0]);

  function handleCheckboxChange(node) {
    if (selectedIds.includes(node)) {
      setSelectedIds(selectedIds => selectedIds.filter(item => item !== node));
    }
    else {
      setSelectedIds([...selectedIds, node])
    }
  }
  // handle search input
  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };

  // Function to filter items based on the search query
  const filteredItems = nodes.filter((node) =>
    node.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleReset() {
    setSelectedIds(nodes);
  };

  function deselectAll() {
    setSelectedIds([]);

  }
  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  function handleFilter() {
    let microservices = graphData["nodes"];
    let nodes = [];

    for (let i = 0; i < microservices.length; i++) {
      let microservice = microservices[i];
      if (selectedIds.includes(microservice["nodeName"])) {
        nodes.push(microservice["nodeName"]);
      }

    }
    let data = getGraphData(values["graphTimeline"][values["currentInstance"]], nodes);

    let connections = getConnections(values["graphTimeline"][values["currentInstance"]], nodes, data["links"],);
    navigate('/node', { state: JSON.stringify(connections) });

  }
  return null;
};

// CSS-in-JS styles
const styles = {
  Bar: {
    display: 'flex',
    top: "59%",
    width: "25%",
    fontSize: "20px",
    overflow: "auto",
    height: "39%",
    bottom: "1px",
  },
  searchBar: {
    display: 'flex',
    fontSize: "30px",
    overflow: "auto",
    marginLeft: 'auto',
    marginRight: 'auto',
    marginTop: '5px',
    width: '250px',
    padding: '10px',
    borderRadius: '20px',
    border: '1px solid #ccc',
    outline: 'none',
    fontSize: '16px',

  },
  scrollBar: {
    gap: '20',
    overflow: "auto",


  },
  list: {
    padding: '10px 20px',

  },
  checkbox: {
    marginRight: '15px',
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  buttons: {
    display: 'flex',
    marginTop: 'auto',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    overflow: 'auto',
    padding: '10px 20px',
    fontSize: '20px',
    borderRadius: '20px',
    backgroundColor: 'white',
    color: 'black',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.3s ease',
  },
}
