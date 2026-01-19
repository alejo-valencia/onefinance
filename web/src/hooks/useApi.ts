import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export function useApi() {
  const { getIdToken } = useAuth();
  const { config } = useConfig();

  const callApi = useCallback(
    async (
      endpoint: string,
      method: HttpMethod = "GET",
      body?: Record<string, unknown>,
      queryParams?: Record<string, string>
    ) => {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Not authenticated. Please sign in again.");
      }

      if (!config?.functionsBaseUrl) {
        throw new Error("API base URL not configured");
      }

      let url = config.functionsBaseUrl + endpoint;

      // Add query parameters for GET requests
      if (method === "GET" && queryParams) {
        const params = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        if (params.toString()) {
          url += "?" + params.toString();
        }
      }

      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: "Bearer " + token,
        },
      };

      // Add body for non-GET requests
      if (method !== "GET" && body) {
        fetchOptions.headers = {
          ...fetchOptions.headers,
          "Content-Type": "application/json",
        };
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Request failed");
      }

      return data;
    },
    [getIdToken, config]
  );

  return { callApi };
}
