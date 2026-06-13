/**
 * In-memory access token store (never localStorage — XSS mitigation).
 */
let accessToken = null;

export const tokenStore = {
  getToken() {
    return accessToken;
  },
  setToken(token) {
    accessToken = token ?? null;
  },
  clearToken() {
    accessToken = null;
  },
};
