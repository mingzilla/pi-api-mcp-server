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
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Base command' >> /app/entrypoint.sh && \
    echo 'cmd="node build/index.js"' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Add API URL if provided' >> /app/entrypoint.sh && \
    echo 'if [ -n "$API_URL" ]; then' >> /app/entrypoint.sh && \
    echo '  cmd="$cmd --api-url \"$API_URL\""' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Add auth token if provided' >> /app/entrypoint.sh && \
    echo 'if [ -n "$PI_API_KEY" ]; then' >> /app/entrypoint.sh && \
    echo '  cmd="$cmd --auth-token \"$PI_API_KEY\""' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Execute the command' >> /app/entrypoint.sh && \
    echo 'eval exec $cmd' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]