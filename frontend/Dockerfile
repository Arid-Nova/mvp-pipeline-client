# Use Node.js 18 image as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire React project to the working directory
COPY . .

# When set to "true" the bundle uses same-origin /api/<service> paths
# (for the Caddy reverse-proxy deploy). Defaults to "" so local dev hits
# http://localhost:<port> directly.
ARG REACT_APP_USE_PROXY=""
ENV REACT_APP_USE_PROXY=$REACT_APP_USE_PROXY

# Build the React application
RUN npm run build

# Install http-server to serve the static files
RUN npm install -g http-server

# Expose the port the app will run on
EXPOSE 3000

# Serve the build folder using http-server
CMD ["http-server", "build", "-p", "3000"]
