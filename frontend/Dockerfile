FROM node:18-alpine AS base

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire React project to the working directory
COPY . .

# Making the env.sh script executable
RUN chmod +x env.sh

# -------------------------
# Builder stage (for CI/CD)
# -------------------------
FROM base AS builder

RUN npm run build

# -----------------------------------
# Local build stage (for development)
# -----------------------------------
FROM builder AS development

ENV NODE_ENV=development

# Install `serve` to host the build. Its -s flag serves index.html for unknown
# paths so BrowserRouter deep links like /pipeline survive a hard refresh.
RUN npm install -g serve

# Expose the port the app will run on
EXPOSE 3000

# env.sh writes build/env-config.js from the container's REACT_APP_* variables.
ENTRYPOINT ["./env.sh"]

# Serve the build folder with SPA fallback
CMD ["serve", "-s", "build", "-l", "3000"]

# ---------------------------------------
# Production build stage (for deployment)
# ---------------------------------------

FROM nginx:alpine AS production

ENV NODE_ENV=production

COPY --from=builder /app/build /usr/share/nginx/html

COPY --from=builder /app/env.sh /docker-entrypoint.d/env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

