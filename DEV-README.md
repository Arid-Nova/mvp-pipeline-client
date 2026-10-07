# Development Environment Setup

This project uses Docker for consistent development environments. The following instructions will help you set up and run the entire platform locally.

## Prerequisites

- Docker Engine (version 20.10 or higher)
- Docker Compose (version 1.28 or higher, or Docker Compose V2)

## Development Setup

### Using Dev Container (Recommended)

1. Open the project in Visual Studio Code with the Dev Containers extension installed
2. VS Code will automatically detect the devcontainer configuration and prompt you to reopen in container
3. The development environment will be set up automatically

The dev container is built with minimal dependencies:
- Java 21 (with Maven) for backend services
- Node.js LTS for frontend development  
- Python 3.11 for all Python microservices

The entire repository is copied into the container at `/workspace`. Dependencies are not installed automatically - you can install them as needed for specific projects.

## Services Overview

The platform consists of multiple interconnected services:

1. **Frontend** (`frontend/`): React 18 + TypeScript application on port 3000
2. **Backend** (`backend/`): Spring Boot 3.2 / Java 21 REST API on port 8080
3. **Component Analysis** (`componentanalysis/`): Spring Boot 3.2 / Java 21 service on port 8060
4. **Formal Method** (`formalmethod/`): Python FastAPI service on port 9000
5. **Vector Generator** (`vectorgenerator/`): Python FastAPI service on port 8050
6. **Scenario Generator** (`scenariogenerator/`): Python FastAPI service on port 8040
7. **Test Generator** (`testgenerator/`): Python FastAPI service on port 8030
8. **Test Executor** (`testexecutor/`): Python FastAPI service on port 8010
9. **Aegis API** (`aegis/`): Python FastAPI service on port 8900
10. **Aegis Dashboard** (`aegis/`): Flask UI on port 5600

## Development Workflow

### Running Individual Services

You can run individual services by modifying the docker-compose.yml file or by using:

```bash
docker-compose up <service-name>
```

### Testing Changes

1. Make changes to any service
2. Rebuild the specific service container:
   ```bash
   docker-compose build <service-name>
   ```
3. Restart the service:
   ```bash
   docker-compose up -d <service-name>
   ```

## Environment Variables

The services use environment variables defined in `.env` file. You can create a local `.env` file with:

```bash
# Example .env file
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GROQ_API_KEY=your_groq_key_here
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: If ports are already in use, modify `docker-compose.yml` to use different ports
2. **Build failures**: Run `docker-compose build --no-cache` to rebuild all services
3. **Dependency issues**: Run `npm install` in frontend directory and ensure Python dependencies are installed

### Useful Commands

```bash
# View running containers
docker ps

# View logs for a specific service
docker-compose logs <service-name>

# Stop all containers
docker-compose down

# Clean up unused resources
docker system prune -a
```

## Development Tips

1. **Frontend Development**: The frontend will automatically reload when changes are made
2. **Backend Development**: Changes to Java code require rebuilding the service
3. **Python Services**: Changes to Python code are automatically reflected without rebuilding
4. **Database**: All services connect to the same MariaDB and MongoDB instances
5. **Debugging**: Use VS Code's debugging capabilities with appropriate launch configurations

## Project Structure

```
.
├── backend/               # Spring Boot Java backend (port 8080)
├── componentanalysis/     # Component analysis service (port 8060)
├── frontend/              # React TypeScript frontend (port 3000)
├── formalmethod/          # Formal method verification service (port 9000)
├── vectorgenerator/       # Vector generation service (port 8050)
├── scenariogenerator/     # Scenario generation service (port 8040)
├── testgenerator/         # Test generation service (port 8030)
├── testexecutor/          # Test execution service (port 8010)
├── aegis/                 # Aegis risk analysis service (ports 8900, 5600)
├── .devcontainer/         # Dev container configuration
├── Dockerfile.dev         # Development Dockerfile
├── docker-compose.yml     # Service orchestration
└── DEV-README.md          # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

This development setup ensures consistency across all team members and provides an isolated environment for testing the complex microservice platform.