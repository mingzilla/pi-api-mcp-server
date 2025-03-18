# PI API MCP Server

A Model Context Protocol (MCP) server that provides standardized tools and resources for interacting with the PI Dashboard API. This implementation enables Claude and other MCP-compatible AI assistants to securely access and manage PI Dashboard resources, including categories and charts.

### Utilizing PI with MCP

The following demonstrates typical usage scenarios for this MCP Server after setup completion.

Initial Authentication:

- Execute the following instructions to establish a connection:

```
Ensure the PI API MCP server is running
Set the API URL to http://localhost:8224/pi/api/v2
Authenticate using your username and password credentials
List two charts from the dashboard
```

Chart Analysis:

- If chart ID 450 contains metadata information, use the following prompt:

```
Retrieve the metadata from chart ID 450
Extract the chart JSON data from ID 450
Identify chart IDs associated with claims
Obtain JSON data for the identified charts
Analyze the data to generate actionable insights
```

Example Output:

![example-response.png](example-response.png)

## Installation - Using Docker (Recommended)

- No MCP Server configuration needed
- MCP client configuration file setup:

```json
{
  "mcpServers": {
    "pi-api": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_URL=http://localhost:8224/pi/api/v2",
        "-e",
        "PI_API_KEY=XXXXXXXX",
        "mingzilla/pi-api-mcp-server"
      ],
      "disabled": false,
      "autoApprove": [
        "authenticate",
        "keep-session-alive",
        "list-categories",
        "get-category",
        "list-charts",
        "get-chart"
      ]
    }
  }
}

```

**Important Note**: If the `--api-url` parameter is not provided at initialization, the server will prompt you to configure the API URL using the `set-api-url` tool before executing any operations. This design enables flexible configuration in environments where the URL is not predetermined at startup.

## Configuration File Location

Access your Claude for Desktop application configuration at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: Use other tools for now. e.g. Cline - ask it to show you the MCP config file

## Available Tools

### API Configuration

- **set-api-url**: Configure the base API URL for all requests
  ```
  Set the API URL to http://localhost:8224/pi/api/v2
  ```

### Authentication

- **authenticate**: Authenticate with the PI API
- **keep-session-alive**: Keep the current token session alive
- **logout**: Invalidate the current token and end the session
- **set-organization**: Set the organization ID for subsequent requests

### Categories

- **list-categories**: List all categories with pagination support
- **get-category**: Get a category by ID
- **create-category**: Create a new category
- **update-category**: Update an existing category
- **delete-category**: Delete a category
- **list-category-objects**: List all objects for a specific category

### Charts

- **list-charts**: List all charts with pagination support
- **get-chart**: Get a chart by ID
- **delete-chart**: Delete a chart
- **export-chart**: Export a chart in various formats

## Available Resources

- **auth://status**: Get authentication status
- **categories://list**: List all categories
- **categories://{id}**: Get a specific category
- **categories://{categoryId}/objects**: Get objects for a specific category
- **charts://list**: List all charts
- **charts://{id}**: Get a specific chart
- **charts://{id}/export/{format}**: Export a chart in a specific format

## Available Prompts

- **analyze-categories**: Analyze categories in the dashboard
- **analyze-charts**: Analyze charts in the dashboard
- **compare-charts**: Compare data between two charts
- **category-usage-analysis**: Analyze how categories are being used in charts

## Claude Integration Examples

Here are some example queries to use with Claude after connecting the server:

### Set the API URL

```
Please use the set-api-url tool to set the PI API URL to http://localhost:8224/pi/api/v2
```

### Authentication

```
Please authenticate to the PI API with my username and password.
```

### Working with Categories

```
List all categories in the dashboard.
```

```
Get details about category with ID 123.
```

### Working with Charts

```
List all the charts available in the dashboard.
```

```
Export chart with ID 456 as a PDF.
```

### Using Analysis Prompts

```
Analyze the categories in the dashboard.
```

```
Compare data between charts 123 and 456.
```

----

## Development

### Local Execution

- Note: you can make use of `start.sh` to run the dev server as well.

~~~bash
# Clone the repository (SSH or HTTPS option)
git clone git@github.com:mingzilla/pi-api-mcp-server.git
cd pi-api-mcp-server

# Install dependencies
npm install
./dependencies.sh # Installs global dependencies to enable MCP client connection via "@mingzilla/pi-api-mcp-server"

# Build the project
npm run build

# Execute the server
npm start
~~~

### NPM Installation

~~~bash
# Global installation
npm install -g @mingzilla/pi-api-mcp-server

# Direct execution via npx
npx @mingzilla/pi-api-mcp-server --api-url "http://localhost:8224/pi/api/v2" --auth-token "XXXXXXXX"
~~~

### MCP Client Configuration

Integration with Claude for Desktop:

#### Node.js Implementation

- Execute the instructions in the "Local Execution" section
- Ensure `./dependencies.sh` has been executed to install required dependencies
- Implement the following configuration (Note: "@mingzilla/pi-api-mcp-server" references the package installed through "Local Execution")

~~~json
{
  "mcpServers": {
    "pi-api": {
      "command": "npx",
      "args": [
        "-y",
        "@mingzilla/pi-api-mcp-server",
        "--api-url",
        "http://localhost:8224/pi/api/v2",
        "--auth-token",
        "XXXXXXXX"
      ]
    }
  }
}
~~~

### Development Check List
- update code -> start local server -> test local server with file path to index.js
- update readme.md file -> change the mcpServers config section: docker + node + npx
- ./publish.sh - publish to npm
- ./dockerBuild.sh -> ./dockerPublish.sh (edit version number to match package.json) -> test docker config
- push code to github

## License

MIT License

## Author

Ming Huang (mingzilla)