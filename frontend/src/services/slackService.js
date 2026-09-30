import { apiClient } from "@/lib/apiClient";

export const slackService = {
  async getStatus() {
    const { data } = await apiClient.get("/auth/slack/status");
    return data.data;
  },
  async connect({ webhookUrl, teamName }) {
    const { data } = await apiClient.post("/auth/slack/connect", {
      webhookUrl,
      teamName,
    });
    return data.data;
  },
  async disconnect() {
    const { data } = await apiClient.post("/auth/slack/disconnect");
    return data.data;
  },
  async startOAuth() {
    const { data } = await apiClient.get("/auth/slack/oauth/start");
    return data.data.url;
  },
};
