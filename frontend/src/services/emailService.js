import { apiClient } from "@/lib/apiClient";

export const emailService = {
  async scheduleEmail(payload) {
    const { data } = await apiClient.post("/emails/schedule", payload);
    return data.data;
  },

  async getScheduledEmails({ page = 1, limit = 20, status, search } = {}) {
    const { data } = await apiClient.get("/emails/scheduled", {
      params: { page, limit, status, search },
    });
    return data;
  },

  async getSentEmails({ page = 1, limit = 20, status, search } = {}) {
    const { data } = await apiClient.get("/emails/sent", {
      params: { page, limit, status, search },
    });
    return data;
  },

  async getStats() {
    const { data } = await apiClient.get("/emails/stats");
    return data.data;
  },

  async getById(id) {
    const { data } = await apiClient.get(`/emails/${id}`);
    return data.data;
  },

  async retry(id) {
    const { data } = await apiClient.post(`/emails/${id}/retry`);
    return data.data;
  },

  async search(q) {
    const { data } = await apiClient.get("/emails/search", { params: { q } });
    return data.data;
  },

  async getQueueHealth() {
    const { data } = await apiClient.get("/health/queue");
    return data;
  },

  /** Upload files for attachment; returns [{id, filename, size, mimetype}]. */
  async uploadAttachments(files) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const { data } = await apiClient.post("/emails/attachments", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data.attachments;
  },
};
