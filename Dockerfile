FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files, tsconfig, and source
COPY package.json tsconfig.json index.ts ./

# Remove the prepare script that depends on run.sh
RUN sed -i '/prepare/d' package.json

# Install all dependencies (dev dependencies are actually runtime dependencies here)
RUN npm install --only=dev

# Build the TypeScript code
RUN npm run build

# Add metadata labels
LABEL org.opencontainers.image.title="PI API MCP Server"
LABEL org.opencontainers.image.description="An MCP server for interacting with the PI Dashboard API"
LABEL org.opencontainers.image.version="1.0.5"
LABEL org.opencontainers.image.authors="mingzilla"
LABEL org.opencontainers.image.url="https://github.com/mingzilla/pi-api-mcp-server"
LABEL org.opencontainers.image.source="https://github.com/mingzilla/pi-api-mcp-server"

# Create an entrypoint script to handle environment variables
RUN printf '#!/bin/sh\nif [ -n "$API_URL" ]; then\n  exec node build/index.js --api-url "$API_URL"\nelse\n  exec node build/index.js\nfi\n' > entrypoint.sh && \
    chmod +x entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]