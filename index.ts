#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fetch from "node-fetch";
import { Buffer } from 'buffer';

// Logging
const logError = (message: string) => {
  console.error(`ERROR: ${message}`);
};

const logInfo = (message: string) => {
  console.error(`INFO: ${message}`);
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const apiUrlIndex = args.indexOf('--api-url');
  const authTokenIndex = args.indexOf('--auth-token');

  const result = {
    apiUrl: null,
    authToken: null
  } as any;

  if (apiUrlIndex !== -1 && apiUrlIndex + 1 < args.length) {
    result.apiUrl = args[apiUrlIndex + 1];
  }

  if (authTokenIndex !== -1 && authTokenIndex + 1 < args.length) {
    result.authToken = args[authTokenIndex + 1];
  }

  return result;
}

// Extract command line arguments
const cmdArgs = parseArgs();
let API_BASE_URL = cmdArgs.apiUrl;
logInfo(`Command line API URL: ${API_BASE_URL || 'not provided'}`);

// Set auth token if provided via command line
let authToken: string | null = null;
if (cmdArgs.authToken) {
  authToken = cmdArgs.authToken;
  logInfo("Auth token provided via command line");
}

// Global token storage and state management
let orgId: number | null = null;
let apiUrlSet: boolean = !!API_BASE_URL;
let connectionVerified: boolean = false;

// Helper to safely extract error messages
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

// Create an MCP server
const server = new McpServer({
  name: "PI API Server",
  version: "1.0.0"
});

// Helper function for making authenticated API requests
async function authenticatedRequest(
    endpoint: string,
    method: string = "GET",
    body: any = null,
    queryParams: Record<string, string> = {}
) {
  if (!apiUrlSet) {
    throw new Error("API URL not set. Please set the API URL using the set-api-url tool.");
  }

  if (!authToken) {
    throw new Error("Not authenticated. Please authenticate first.");
  }

  // Build URL with query parameters
  let url = `${API_BASE_URL}${endpoint}`;

  // Add orgId if available
  if (orgId !== null) {
    queryParams.orgId = orgId.toString();
  }

  // Add query parameters if any
  if (Object.keys(queryParams).length > 0) {
    const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
    url = `${url}?${queryString}`;
  }

  logInfo(`Making ${method} request to ${url}`);

  const headers: Record<string, string> = {
    "Authorization": `bearer ${authToken}`,
    "Content-Type": "application/json"
  };

  const options: any = {
    method,
    headers
  };

  if (body !== null && ["POST", "PUT"].includes(method)) {
    options.body = JSON.stringify(body);
    logInfo(`Request body: ${JSON.stringify(body)}`);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      logError(`API request failed with status ${response.status}: ${errorText}`);
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    // Check if the response is JSON or binary
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const jsonData = await response.json();
      logInfo(`Received JSON response: ${JSON.stringify(jsonData).substring(0, 200)}...`);
      return jsonData;
    } else if (contentType.includes("text/csv") ||
        contentType.includes("application/pdf") ||
        contentType.includes("image/") ||
        contentType.includes("application/vnd.openxmlformats")) {
      // For binary/file responses, return a base64 encoded string
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      logInfo(`Received binary response of type ${contentType}, length: ${base64.length}`);
      return {
        contentType,
        data: base64
      };
    } else {
      // Otherwise, return as text
      const text = await response.text();
      logInfo(`Received text response: ${text.substring(0, 200)}...`);
      return text;
    }
  } catch (error) {
    logError(`API request error: ${getErrorMessage(error)}`);
    throw error;
  }
}

// Helper function to verify connection status
async function verifyConnection(): Promise<boolean> {
  if (!apiUrlSet || !API_BASE_URL) {
    return false;
  }

  if (!authToken) {
    return false;
  }

  try {
    // Try a lightweight request to verify the connection
    await authenticatedRequest("/tokens/keepAlive", "POST");
    connectionVerified = true;
    return true;
  } catch (error) {
    logError(`Connection verification failed: ${getErrorMessage(error)}`);
    connectionVerified = false;
    return false;
  }
}

//
// CONNECTION STATUS TOOL
//
server.tool(
    "check-connection",
    "Check if the current API URL and authentication are valid",
    {},
    async () => {
      try {
        if (!apiUrlSet || !API_BASE_URL) {
          return {
            content: [{
              type: "text",
              text: "API URL not set. Please set the API URL using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            content: [{
              type: "text",
              text: "Not authenticated. Please authenticate using the authenticate tool."
            }]
          };
        }

        // Verify the connection
        const isConnected = await verifyConnection();

        if (isConnected) {
          return {
            content: [{
              type: "text",
              text: `✅ Connection successful! The API URL and token are valid. You're ready to use the PI API.`
            }]
          };
        } else {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `❌ Connection failed. The token might be invalid or expired. Please try to authenticate again.`
            }]
          };
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Connection check failed: ${getErrorMessage(error)}` }]
        };
      }
    }
);

//
// API URL CONFIGURATION TOOL
//

// Set API URL tool
server.tool(
    "set-api-url",
    "Set the API base URL for all requests",
    {
      url: z.string().describe("API base URL (e.g., http://localhost:8224/pi/api/v2)")
    },
    async ({ url }) => {
      try {
        // Validate URL format
        try {
          new URL(url);
        } catch (e) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Invalid URL format. Please provide a valid URL including protocol (http:// or https://).`
            }]
          };
        }

        API_BASE_URL = url;
        apiUrlSet = true;
        connectionVerified = false;

        return {
          content: [{
            type: "text",
            text: `API URL set to: ${url}\n\nNext step: Please authenticate to start using the API.`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error setting API URL: ${getErrorMessage(error)}` }]
        };
      }
    }
);

//
// AUTHENTICATION TOOLS
//

// Authentication guide tool
server.tool(
    "authenticate",
    "Guide for authenticating with the PI API",
    {},
    async () => {
      try {
        // Check if already authenticated successfully
        if (authToken && await verifyConnection()) {
          return {
            content: [{
              type: "text",
              text: "✅ You are already authenticated and your token is valid. You can use the API without further authentication."
            }]
          };
        }

        // Check if API URL is set
        if (!apiUrlSet) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: "Authentication options:\n\n" +
                "1. If you have a token (strongly preferred):\n" +
                "   - Use the keep-session-alive tool with your token\n" +
                "   - This will verify and set your token in one step\n\n" +
                "2. If you don't have a token (last resort):\n" +
                "   - Use the authenticate-with-credentials tool\n" +
                "   - Format: authenticate-with-credentials with \"username password\""
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error during authentication guide: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Keep token alive tool - Enhanced to support token provisioning
server.tool(
    "keep-session-alive",
    "Verify and refresh the current authentication token (also used for token-based authentication)",
    {
      token: z.string().optional().describe("Optional: Provide a token to use for authentication")
    },
    async ({ token }) => {
      try {
        if (!apiUrlSet) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        // If a token is provided, use it instead of the current one
        const originalToken = authToken;
        if (token) {
          authToken = token;
          logInfo("Token provided via keep-session-alive tool");
        }

        if (!authToken) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "No token available. Please provide a token or authenticate with credentials."
            }]
          };
        }

        try {
          // Try to keep the session alive
          await authenticatedRequest("/tokens/keepAlive", "POST");
          connectionVerified = true;

          // If we got here, the token is valid
          return {
            content: [{
              type: "text",
              text: token
                  ? "✅ Token validated and set successfully. You are now authenticated."
                  : "✅ Session kept alive successfully. Your token is valid."
            }]
          };
        } catch (error) {
          // If validation fails and we were using a provided token, restore the original
          if (token) {
            authToken = originalToken;
          }

          connectionVerified = false;

          return {
            isError: true,
            content: [{
              type: "text",
              text: token
                  ? `❌ The provided token is invalid or expired: ${getErrorMessage(error)}\nPlease try with another token or use authenticate-with-credentials.`
                  : `❌ Your session token is invalid or expired: ${getErrorMessage(error)}\nPlease authenticate again.`
            }]
          };
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error keeping session alive: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Authentication with credentials tool
server.tool(
    "authenticate-with-credentials",
    "Authenticate with the PI API using username and password (last resort option)",
    {
      credentials: z.string().describe("Username and password as 'username password'")
    },
    async ({ credentials }) => {
      try {
        if (!apiUrlSet) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        // Parse credentials - simple space separation
        const parts = credentials.trim().split(/\s+/);

        if (parts.length < 2) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Invalid credentials format. Please provide as 'username password'"
            }]
          };
        }

        // First part is username, rest is considered password (in case password has spaces)
        const username = parts[0];
        const password = parts.slice(1).join(' ');

        if (!username || !password) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Both username and password are required. Please provide as 'username password'"
            }]
          };
        }

        // Authenticate with the credentials
        const credentialsBase64 = Buffer.from(`${username}:${password}`).toString("base64");

        const response = await fetch(`${API_BASE_URL}/tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `basic ${credentialsBase64}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            isError: true,
            content: [{ type: "text", text: `Authentication failed: ${response.status} - ${errorText}` }]
          };
        }

        const data = await response.json();
        if (data && typeof data === 'object' && 'token' in data && typeof data.token === 'string') {
          authToken = data.token;
          connectionVerified = true;
        } else {
          return {
            isError: true,
            content: [{ type: "text", text: "Authentication failed: Invalid response format" }]
          };
        }

        return {
          content: [{
            type: "text",
            text: "✅ Authentication successful. You can now use other tools and resources."
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error authenticating: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Logout tool
server.tool(
    "logout",
    "Invalidate the current token and end the session",
    {},
    async () => {
      try {
        if (!apiUrlSet) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            isError: true,
            content: [{ type: "text", text: "Not authenticated yet. No need to logout." }]
          };
        }

        await authenticatedRequest("/tokens/invalidate", "POST");
        authToken = null;
        connectionVerified = false;

        return {
          content: [{
            type: "text",
            text: "Logged out successfully. Token invalidated."
          }]
        };
      } catch (error) {
        authToken = null; // Force logout even if API call fails
        connectionVerified = false;
        return {
          isError: true,
          content: [{ type: "text", text: `Error during logout: ${getErrorMessage(error)}. Token cleared locally.` }]
        };
      }
    }
);

// Set organization ID tool
server.tool(
    "set-organization",
    "Set the organization ID for subsequent requests",
    {
      orgId: z.number().describe("Organization ID")
    },
    async ({ orgId: newOrgId }) => {
      try {
        orgId = newOrgId;

        return {
          content: [{
            type: "text",
            text: `Organization ID set to ${newOrgId}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error setting organization ID: ${getErrorMessage(error)}` }]
        };
      }
    }
);

//
// CATEGORY TOOLS
//

// List Categories tool
server.tool(
    "list-categories",
    "List all categories with pagination support",
    {
      filter: z.string().optional().describe("Optional filter for categories (e.g., 'description(eq)=Marketing')"),
      page: z.number().optional().default(1).describe("Page number for pagination"),
      pageSize: z.number().optional().default(20).describe("Number of items per page")
    },
    async ({ filter, page, pageSize }) => {
      try {
        const queryParams: Record<string, string> = {
          page: page.toString(),
          pageSize: pageSize.toString()
        };

        if (filter) {
          // Parse the filter string to extract the field name, operator, and value
          const match = filter.match(/([a-zA-Z]+)\(([a-zA-Z]+)\)=(.+)/);
          if (match) {
            const [_, field, operator, value] = match;
            queryParams[`${field}(${operator})`] = value;
          }
        }

        const categories = await authenticatedRequest("/categories", "GET", null, queryParams);

        return {
          content: [{
            type: "text",
            text: `Categories retrieved successfully:\n${JSON.stringify(categories, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching categories: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Get Category By ID tool
server.tool(
    "get-category",
    "Get a category by ID",
    {
      id: z.number().describe("Category ID")
    },
    async ({ id }) => {
      try {
        const category = await authenticatedRequest(`/categories/${id}`);

        return {
          content: [{
            type: "text",
            text: `Category details:\n${JSON.stringify(category, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching category: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Create Category tool
server.tool(
    "create-category",
    "Create a new category",
    {
      description: z.string().describe("Unique name of a category"),
      orgId: z.number().describe("Organization ID"),
      label: z.string().optional().describe("Alternative text for the category"),
      helpText: z.string().optional().describe("Help text to describe the category"),
      categoryObjectsPosition: z.enum(["RIGHT", "TOP"]).optional().describe("Position of category objects panel"),
      cascadeFilters: z.boolean().optional().describe("Enable cascading filters")
    },
    async ({ description, orgId, label, helpText, categoryObjectsPosition, cascadeFilters }) => {
      try {
        const payload: any = {
          description,
          orgId
        };

        if (label !== undefined) payload.label = label;
        if (helpText !== undefined) payload.helpText = helpText;
        if (categoryObjectsPosition !== undefined) payload.categoryObjectsPosition = categoryObjectsPosition;
        if (cascadeFilters !== undefined) payload.cascadeFilters = cascadeFilters;

        const result = await authenticatedRequest("/categories", "POST", payload);

        return {
          content: [{
            type: "text",
            text: `Category created successfully:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating category: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Update Category tool
server.tool(
    "update-category",
    "Update an existing category",
    {
      id: z.number().describe("Category ID"),
      description: z.string().optional().describe("Unique name of a category"),
      label: z.string().optional().describe("Alternative text for the category"),
      helpText: z.string().optional().describe("Help text to describe the category"),
      categoryObjectsPosition: z.enum(["RIGHT", "TOP"]).optional().describe("Position of category objects panel"),
      cascadeFilters: z.boolean().optional().describe("Enable cascading filters")
    },
    async ({ id, description, label, helpText, categoryObjectsPosition, cascadeFilters }) => {
      try {
        const payload: any = {};

        if (description !== undefined) payload.description = description;
        if (label !== undefined) payload.label = label;
        if (helpText !== undefined) payload.helpText = helpText;
        if (categoryObjectsPosition !== undefined) payload.categoryObjectsPosition = categoryObjectsPosition;
        if (cascadeFilters !== undefined) payload.cascadeFilters = cascadeFilters;

        const result = await authenticatedRequest(`/categories/${id}`, "PUT", payload);

        return {
          content: [{
            type: "text",
            text: `Category updated successfully:\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error updating category: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Delete Category tool
server.tool(
    "delete-category",
    "Delete a category",
    {
      id: z.number().describe("Category ID")
    },
    async ({ id }) => {
      try {
        await authenticatedRequest(`/categories/${id}`, "DELETE");

        return {
          content: [{
            type: "text",
            text: `Category with ID ${id} successfully deleted.`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error deleting category: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// List Category Objects tool
server.tool(
    "list-category-objects",
    "List all objects for a specific category",
    {
      categoryId: z.number().describe("Category ID")
    },
    async ({ categoryId }) => {
      try {
        const categoryObjects = await authenticatedRequest(`/categories/${categoryId}/categoryObjects`);

        return {
          content: [{
            type: "text",
            text: `Category objects retrieved successfully:\n${JSON.stringify(categoryObjects, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching category objects: ${getErrorMessage(error)}` }]
        };
      }
    }
);

//
// CHART TOOLS
//

// List Charts tool
server.tool(
    "list-charts",
    "List all charts with pagination support",
    {
      filter: z.string().optional().describe("Optional filter for charts"),
      page: z.number().optional().default(1).describe("Page number for pagination"),
      pageSize: z.number().optional().default(20).describe("Number of items per page")
    },
    async ({ filter, page, pageSize }) => {
      try {
        const queryParams: Record<string, string> = {
          page: page.toString(),
          pageSize: pageSize.toString()
        };

        if (filter) {
          // Parse the filter string to extract the field name, operator, and value
          const match = filter.match(/([a-zA-Z]+)\(([a-zA-Z]+)\)=(.+)/);
          if (match) {
            const [_, field, operator, value] = match;
            queryParams[`${field}(${operator})`] = value;
          }
        }

        const charts = await authenticatedRequest("/charts", "GET", null, queryParams);

        return {
          content: [{
            type: "text",
            text: `Charts retrieved successfully:\n${JSON.stringify(charts, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching charts: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Get Chart By ID tool
server.tool(
    "get-chart",
    "Get a chart by ID",
    {
      id: z.number().describe("Chart ID")
    },
    async ({ id }) => {
      try {
        const chart = await authenticatedRequest(`/charts/${id}`);

        return {
          content: [{
            type: "text",
            text: `Chart details:\n${JSON.stringify(chart, null, 2)}`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching chart: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Delete Chart tool
server.tool(
    "delete-chart",
    "Delete a chart",
    {
      id: z.number().describe("Chart ID")
    },
    async ({ id }) => {
      try {
        await authenticatedRequest(`/charts/${id}`, "DELETE");

        return {
          content: [{
            type: "text",
            text: `Chart with ID ${id} successfully deleted.`
          }]
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error deleting chart: ${getErrorMessage(error)}` }]
        };
      }
    }
);

// Export Chart tool
server.tool(
    "export-chart",
    "Export a chart in various formats",
    {
      id: z.number().describe("Chart ID"),
      format: z.enum(["csv", "docx", "xlsx", "jpeg", "json", "png", "pdf", "pptx"]).describe("Export format")
    },
    async ({ id, format }) => {
      try {
        const result = await authenticatedRequest(`/charts/${id}/${format}`);

        if (result && typeof result === 'object' &&
            'contentType' in result && 'data' in result &&
            typeof result.data === 'string') {
          // This is a binary response
          return {
            content: [{
              type: "text",
              text: `Chart exported successfully as ${format.toUpperCase()}.\nContent type: ${result.contentType}\nBase64 data: ${result.data.substring(0, 100)}...`
            }]
          };
        } else {
          // This is a JSON or text response
          return {
            content: [{
              type: "text",
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }]
          };
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error exporting chart: ${getErrorMessage(error)}` }]
        };
      }
    }
);

//
// RESOURCE DEFINITIONS
//

// Enhanced authentication status resource
server.resource(
    "auth-status",
    "auth://status",
    async (uri) => {
      const isReady = apiUrlSet && !!API_BASE_URL && authToken !== null && connectionVerified;

      // Try to verify the connection if we have an URL and token but it's not verified yet
      let connectionStatus = "Unknown";
      if (apiUrlSet && !!API_BASE_URL && authToken !== null) {
        if (connectionVerified) {
          connectionStatus = "Verified";
        } else {
          // Try to verify in background
          verifyConnection().then(result => {
            connectionStatus = result ? "Verified" : "Failed";
          }).catch(() => {
            connectionStatus = "Failed";
          });
          connectionStatus = "Pending verification";
        }
      } else {
        connectionStatus = "Not configured";
      }

      return {
        contents: [{
          uri: uri.href,
          text: `API URL: ${apiUrlSet ? API_BASE_URL : "Not set"}\n` +
              `Authentication: ${authToken ? "Token present" : "Not authenticated"}\n` +
              `Connection Status: ${connectionStatus}\n` +
              `Organization: ${orgId !== null ? orgId : "Not set"}\n` +
              `Ready to use: ${isReady ? "Yes - You can use the API" : "No - Additional setup required"}\n\n` +
              `${!isReady ? "Setup Instructions:\n" +
                  (!apiUrlSet ? "1. Set API URL using the set-api-url tool\n" : "") +
                  (!authToken ? "2. Authenticate using the authenticate tool\n" : "") +
                  (authToken && !connectionVerified ? "3. Verify your token using the keep-session-alive tool\n" : "") : ""}`
        }]
      };
    }
);

// Categories resource
server.resource(
    "categories-list",
    "categories://list",
    async (uri) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const categories = await authenticatedRequest("/categories");

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(categories, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching categories: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

// Single category resource
server.resource(
    "category-detail",
    new ResourceTemplate("categories://{id}", { list: undefined }),
    async (uri, { id }) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const category = await authenticatedRequest(`/categories/${id}`);

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(category, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching category: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

// Category objects resource
server.resource(
    "category-objects",
    new ResourceTemplate("categories://{categoryId}/objects", { list: undefined }),
    async (uri, { categoryId }) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const categoryObjects = await authenticatedRequest(`/categories/${categoryId}/categoryObjects`);

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(categoryObjects, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching category objects: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

// Charts resource
server.resource(
    "charts-list",
    "charts://list",
    async (uri) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const charts = await authenticatedRequest("/charts");

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(charts, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching charts: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

// Single chart resource
server.resource(
    "chart-detail",
    new ResourceTemplate("charts://{id}", { list: undefined }),
    async (uri, { id }) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const chart = await authenticatedRequest(`/charts/${id}`);

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(chart, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching chart: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

// Chart export resource
server.resource(
    "chart-export",
    new ResourceTemplate("charts://{id}/export/{format}", { list: undefined }),
    async (uri, { id, format }) => {
      try {
        if (!apiUrlSet) {
          return {
            contents: [{
              uri: uri.href,
              text: "API URL not set. Please set the API URL first using the set-api-url tool."
            }]
          };
        }

        if (!authToken) {
          return {
            contents: [{
              uri: uri.href,
              text: "Not authenticated. Please authenticate first using the authenticate tool."
            }]
          };
        }

        const result = await authenticatedRequest(`/charts/${id}/${format}`);

        return {
          contents: [{
            uri: uri.href,
            text: typeof result === 'string'
                ? result
                : result && typeof result === 'object' && 'contentType' in result
                    ? `Binary data of type ${result.contentType}`
                    : JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error exporting chart: ${getErrorMessage(error)}`
          }]
        };
      }
    }
);

//
// PROMPTS FOR DATA ANALYSIS
//

// Prompt for analyzing categories
server.prompt(
    "analyze-categories",
    "Analyze categories in the dashboard",
    {},
    async () => {
      const needsAuthentication = !apiUrlSet || !authToken || !connectionVerified;

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Please analyze the categories in the dashboard.${needsAuthentication ? "\n\nNote: First check the connection status using the check-connection tool and set up authentication if needed." : ""} 
        
1. ${needsAuthentication ? "After ensuring you're authenticated, use" : "Use"} the 'list-categories' tool to retrieve all categories
2. Provide the following analysis:
   - Total number of categories
   - Categories by orgId (if multiple organizations exist)
   - Identify any categories with special functions (e.g., those with cascadeFilters=false)
   - Recommend any potential category structure improvements based on the description and hierarchy`
          }
        }]
      };
    }
);

// Prompt for analyzing charts
server.prompt(
    "analyze-charts",
    "Analyze charts in the dashboard",
    {},
    async () => {
      const needsAuthentication = !apiUrlSet || !authToken || !connectionVerified;

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Please analyze the charts in the dashboard.${needsAuthentication ? "\n\nNote: First check the connection status using the check-connection tool and set up authentication if needed." : ""} 
        
1. ${needsAuthentication ? "After ensuring you're authenticated, use" : "Use"} the 'list-charts' tool to retrieve all charts
2. Provide the following analysis:
   - Total number of charts
   - Distribution of chart types (count of each chartTypeId)
   - Charts by category (if applicable)
   - Any anonymous charts (anonymous=true)
   - Recommendations for chart organization based on descriptions and categories`
          }
        }]
      };
    }
);

// Prompt for comparing chart data
server.prompt(
    "compare-charts",
    "Compare data between two charts",
    {
      chartId1: z.string().describe("First chart ID"),
      chartId2: z.string().describe("Second chart ID"),
      format: z.string().optional().describe("Export format for comparison (json or csv)")
    },
    async ({ chartId1, chartId2, format }) => {
      const needsAuthentication = !apiUrlSet || !authToken || !connectionVerified;

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Please compare the data between two charts.${needsAuthentication ? "\n\nNote: First check the connection status using the check-connection tool and set up authentication if needed." : ""} 
        
1. ${needsAuthentication ? "After ensuring you're authenticated, perform" : "Perform"} the following actions:
   - Get details for chart ${chartId1} using the 'get-chart' tool
   - Get details for chart ${chartId2} using the 'get-chart' tool
   - Export both charts in ${format || "json"} format using the 'export-chart' tool
   - Compare the data structure and content between the two charts
   - Identify key differences in metrics, dimensions, or data patterns
   - Suggest potential insights based on the comparison`
          }
        }]
      };
    }
);

// Prompt for category usage analysis
server.prompt(
    "category-usage-analysis",
    "Analyze how categories are being used in charts",
    {},
    async () => {
      const needsAuthentication = !apiUrlSet || !authToken || !connectionVerified;

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Please analyze how categories are being used across charts.${needsAuthentication ? "\n\nNote: First check the connection status using the check-connection tool and set up authentication if needed." : ""} 
        
1. ${needsAuthentication ? "After ensuring you're authenticated, follow" : "Follow"} these steps:
   - List all categories using the 'list-categories' tool
   - List all charts using the 'list-charts' tool
   - For each chart, check which category it belongs to
   - Create a summary of:
     * Most frequently used categories for charts
     * Categories with no associated charts
     * Distribution of chart types within each category
   - Recommend potential reorganization of categories or charts to improve dashboard structure`
          }
        }]
      };
    }
);

// Initialize and verify connection on startup
async function initializeAndVerifyConnection() {
  if (apiUrlSet && authToken) {
    logInfo("API URL and auth token provided. Verifying connection...");

    try {
      const isConnected = await verifyConnection();
      if (isConnected) {
        logInfo("✅ Connection verified! API URL and token are valid.");
        console.error("CONNECTION STATUS: Ready - Authentication verified");
      } else {
        logError("❌ Connection verification failed. Token might be invalid or expired.");
        console.error("CONNECTION STATUS: Failed - Authentication provided but validation failed");
        // Reset auth token if it's invalid
        authToken = null;
        connectionVerified = false;
      }
    } catch (error) {
      logError(`❌ Connection verification error: ${getErrorMessage(error)}`);
      console.error("CONNECTION STATUS: Error - Could not verify connection");
      // Reset auth token if verification throws an error
      authToken = null;
      connectionVerified = false;
    }
  } else if (apiUrlSet) {
    logInfo("API URL set but auth token not provided. User will need to authenticate.");
    console.error("CONNECTION STATUS: Partial - API URL set but authentication needed");
  } else {
    logInfo("API URL not set. User will need to configure the connection.");
    console.error("CONNECTION STATUS: Not configured - API URL and authentication needed");
  }
}

// Start the server with initialization message and connection testing
initializeAndVerifyConnection().then(() => {
  // Start the server after initialization
  const transport = new StdioServerTransport();
  server.connect(transport);
  logInfo("PI API MCP Server running on stdio");
}).catch(error => {
  logError(`Error during initialization: ${getErrorMessage(error)}`);
  console.error("CONNECTION STATUS: Error - Initialization failed");

  // Start the server even if initialization fails
  const transport = new StdioServerTransport();
  server.connect(transport);
  logInfo("PI API MCP Server running on stdio despite initialization error");
});