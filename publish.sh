#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
GITHUB_REPO="mingzilla/pi-api-mcp-server"
NPM_PACKAGE="@mingzilla/pi-api-mcp-server"

# Build project first
echo -e "${YELLOW}Building project...${NC}"
npm run build
if [ $? -ne 0 ]; then
  echo -e "${RED}Build failed. Please fix the errors and try again.${NC}"
  exit 1
fi
echo -e "${GREEN}Build successful!${NC}"

# Get package details
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo -e "${YELLOW}Package: ${NPM_PACKAGE}${NC}"
echo -e "${YELLOW}Current version in package.json: ${CURRENT_VERSION}${NC}"

# Check if npm is logged in
NPM_USER=$(npm whoami 2>/dev/null || echo "")
if [ -z "$NPM_USER" ]; then
  echo -e "${RED}Error: You are not logged in to npm. Please run 'npm login' first.${NC}"
  exit 1
fi
echo -e "${GREEN}Logged in as npm user: ${NPM_USER}${NC}"

# Check the latest version on npm
echo "Checking latest published version on npm..."
LATEST_VERSION=$(npm view $NPM_PACKAGE version 2>/dev/null || echo "0.0.0")

if [ $? -ne 0 ] || [ "$LATEST_VERSION" == "" ]; then
  echo -e "${YELLOW}No published version found. This might be the first publish.${NC}"
  LATEST_VERSION="0.0.0"
fi

echo -e "${YELLOW}Latest published version: ${LATEST_VERSION}${NC}"

# Parse version components
IFS='.' read -r -a CURRENT_PARTS <<< "$CURRENT_VERSION"
IFS='.' read -r -a LATEST_PARTS <<< "$LATEST_VERSION"

# Determine the higher version between package.json and npm registry
MAJOR=${CURRENT_PARTS[0]}
if [ ${LATEST_PARTS[0]} -gt $MAJOR ]; then
  MAJOR=${LATEST_PARTS[0]}
fi

MINOR=${CURRENT_PARTS[1]}
if [ ${LATEST_PARTS[1]} -gt $MINOR ]; then
  MINOR=${LATEST_PARTS[1]}
  PATCH=0
else
  PATCH=${CURRENT_PARTS[2]}
  if [ ${LATEST_PARTS[2]} -gt $PATCH ]; then
    PATCH=${LATEST_PARTS[2]}
  fi
fi

# Increment patch version
PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

echo -e "${GREEN}Suggested new version: ${NEW_VERSION}${NC}"

# Prompt for version confirmation or custom version
read -p "Enter version to publish [$NEW_VERSION]: " USER_VERSION
VERSION=${USER_VERSION:-$NEW_VERSION}

# Validate semantic versioning format (basic validation)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Version must follow semantic versioning (e.g., 1.2.3)${NC}"
  exit 1
fi

# Update package.json with the new version
echo "Updating package.json version to $VERSION..."
node -e "const fs = require('fs'); const pkg = require('./package.json'); pkg.version = '$VERSION'; fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n')"

# Verify files exist
if [ ! -d "build" ]; then
  echo -e "${RED}Error: build directory not found. Make sure the project is built correctly.${NC}"
  exit 1
fi

if [ ! -f "build/index.js" ]; then
  echo -e "${RED}Error: build/index.js not found. Make sure the project is built correctly.${NC}"
  exit 1
fi

# Add bin field to package.json if it doesn't exist
echo "Making sure bin field is correctly set in package.json..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');
let updated = false;

if (!pkg.bin || pkg.bin !== 'build/index.js') {
  pkg.bin = 'build/index.js';
  updated = true;
}

if (!pkg.name || pkg.name !== '$NPM_PACKAGE') {
  pkg.name = '$NPM_PACKAGE';
  updated = true;
}

if (updated) {
  fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Updated package.json with correct bin field and name');
}
"

# Make sure index.js is executable
chmod +x build/index.js

# Confirm before publishing
echo ""
echo -e "${YELLOW}Ready to publish:${NC}"
echo -e "${YELLOW}- Package: ${NPM_PACKAGE}${NC}"
echo -e "${YELLOW}- Version: ${VERSION}${NC}"
echo -e "${YELLOW}- Main file: build/index.js${NC}"
echo ""

read -p "Publish to npm? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
  echo "Publish canceled."
  exit 0
fi

# Publish to npm
echo "Publishing to npm..."
npm publish --access=public

if [ $? -eq 0 ]; then
  echo -e "${GREEN}Successfully published ${NPM_PACKAGE}@${VERSION}${NC}"

  # Create a git tag
  echo "Creating git tag v${VERSION}..."
  git add package.json
  git commit -m "Bump version to ${VERSION}"
  git tag -a "v${VERSION}" -m "Version ${VERSION}"

  echo -e "${YELLOW}Remember to push the changes and tag:${NC}"
  echo -e "${YELLOW}  git push origin main${NC}"
  echo -e "${YELLOW}  git push origin v${VERSION}${NC}"

  echo -e "${GREEN}Users can now use your server with this config:${NC}"
  echo -e "{\n  \"mcpServers\": {\n    \"pi-api\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"${NPM_PACKAGE}\"]\n    }\n  }\n}"
else
  echo -e "${RED}Failed to publish to npm${NC}"
  exit 1
fi