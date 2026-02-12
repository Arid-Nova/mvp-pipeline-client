# CloudHubs Microservice System Tool Explorer


A comprehensive platform for visualizing, verifying, and introspecting microservice architectures. This tool combines 3D architectural visualization with formal verification and neuro-symbolic risk analysis to provide a holistic view of system posture and security.

## Core Modules
### 1. CIMET IR Visualizer

An interactive 3D environment for exploring microservice architecture. We use 3D Force-Directed Graph to Visualize complex microservice relationships (nodes, databases, gateways) in a 3D space. Users can generate graphs by parsing code repositories or uploading custom Intermediate Representation (IR) JSON files.

### 2. Formal Verification

A solver-based module for ensuring security policy consistency. First and foremost, this feature verifies if authorization policies are consistent across the entire distributed system. If this identifies conflicting access controls between different microservices, we will suggest what, where the changes need to be made. These changes are shown either in a list view or in the 3D microservie archietcture graph. 

### 3. Aegis Introspection Engine

A neuro-symbolic analysis tool for detecting latent vulnerabilities and analyzing architectural risk. We present a Risk Cloud (2D/3D) that visualizes system risk using Subjective Logic (Belief, Disbelief, Uncertainty). Furtehr we visualize an interactive Call Graphs that Drill down into specific distributed paths to view method-level call chains and data access patterns.

Another feature is Vulnerability Reporting. We display specific security findings with confidence scores, categorized by "Risk Increasing" or "Risk Decreasing" factors.

# Running the MVP with Docker

This guide will help you run the Microservice Visualization Platform (MVP) using Docker.

## Prerequisites

Ensure you have the following installed on your machine:
- Docker
- Docker Compose

## Getting Started

1. **Clone the repository:**

    ```sh
    git clone https://github.com/UACloudVision/mvp-pipeline-client.git
    cd mvp
    ```

2. **Build and run the Docker containers:**

    From the root directory of the project, run the following command:

    ```sh
    docker-compose up --build
    ```

    This command will build the Docker images and start the containers for both the backend and frontend services. '-d' flag can be used to run the containers in detached mode.

	> The first time you run this command, it will take some time to download the required Docker images. Subsequent runs will be faster.

3. **Access the application:**

    Once the containers are up and running, you can access the application in your web browser at:

    ```
    http://localhost:3000
    ```

    The backend API will be available at:

    ```
    http://localhost:8080
	http://localhost:8900
    http://localhost:5600
    ```

	The MariaDB database will be running on port 3306. Please make sure the root password is set correctly and the database name is `msGraph`. The connection URL should be:
	```
	jdbc:mariadb://mvp_db:3306/msGraph
	```
    The Neo4J database will be running on port 7687. Please make sure the root password is set correctly and the database name is `neo4j`. The connection URL should be:
	```
	bolt://aegis_neo4j:7687
	```

## Docker containers
The following Docker containers are used in the MVP:
- `mvp_frontend`: The frontend service built using React.
- `mvp_backend`: The backend service built using Spring Boot.
- `mvp_backend`: The service for executing formal verification of the microservice system.
- `aegis_dashboard`: The frontend service of the Aegis introspection engine.
- `aegis_api`: The backend service of the Aegis introspection engine.
- `mvp_db`: The MariaDB database service.
- `aegis_neo4j`: The Neo4J database service.

You can view the logs of the running containers using the following command:
```sh
docker-compose logs -f
```

## Stopping the Application

To stop the running containers, press `Ctrl+C` in the terminal where `docker-compose` is running, or run the following command from the root directory of the project:

```sh
docker-compose down
```

## Troubleshooting
When running the docker-compose file if you encounter the following error:
```sh
 => ERROR [frontend internal] load metadata for docker.io/library/node:18-alpine
 ```
Please run the following command:
```sh
docker logout
docker login
rm ~/.docker/config.json
```
Then run the docker-compose file again.
