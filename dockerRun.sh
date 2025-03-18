#!/bin/bash
docker run -i --rm -e API_URL=http://localhost:8224/pi/api/v2 -e PI_API_KEY=VyXDS9DZn0RUbctIlsbzx2hNiV34hlSZ47WEoC6UoYLpkMfRXr mingzilla/pi-api-mcp-server