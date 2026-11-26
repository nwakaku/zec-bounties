const configuredBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "");
const backendOrigin =
  configuredBackendUrl ||
  (process.env.NODE_ENV === "production"
    ? "https://zechub.zone"
    : "http://localhost:9000");

export const backendUrl =
  typeof window !== "undefined" &&
  (process.env.NODE_ENV === "production" || configuredBackendUrl)
    ? "/_backend"
    : backendOrigin;

export const backendWebSpocketUrl =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL?.replace(/\/+$/, "") ||
  backendOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

export const IS_DEV = process.env.NODE_ENV !== "production";

// Permanent invite to the Discord support server.
export const discordInviteUrl = "https://discord.gg/d4Dcn3GPGE";
