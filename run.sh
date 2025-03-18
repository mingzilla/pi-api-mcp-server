#!/bin/bash
nvm use 20
npm install -g typescript
npm install -g @types/node
npm install -g @modelcontextprotocol/sdk zod node-fetch

npm run build

# do `npm start` Or Run Specific Command
# node ./build/index.js --api-url http://localhost:8224/pi/api/v2
# node ./build/index.js --api-url http://localhost:8224/pi/api/v2 --auth-token your_token_here
npm start
