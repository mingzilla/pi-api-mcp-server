#!/bin/bash
docker login
docker tag mingzilla/pi-api-mcp-server mingzilla/pi-api-mcp-server:latest
docker tag mingzilla/pi-api-mcp-server mingzilla/pi-api-mcp-server:1.0.8
docker push mingzilla/pi-api-mcp-server:latest
docker push mingzilla/pi-api-mcp-server:1.0.8