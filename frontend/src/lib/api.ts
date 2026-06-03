export interface MessageResponse {
  success: boolean;
  message: string;
  data?: any;
}

export const apiClient = {
  async sendMessage(message: string, walletAddress?: string): Promise<MessageResponse> {
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, walletAddress }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to send message to MCP:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
};
