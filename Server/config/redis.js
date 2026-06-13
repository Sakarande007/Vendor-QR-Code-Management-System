import Redis from "ioredis";

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "vqr:";

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
  keyPrefix: KEY_PREFIX,
  connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 10_000,
  maxRetriesPerRequest: Number(process.env.REDIS_MAX_RETRIES) || 3,
  enableReadyCheck: true,
  lazyConnect:
    process.env.REDIS_LAZY_CONNECT === "true" ||
    (process.env.REDIS_LAZY_CONNECT !== "false" &&
      process.env.NODE_ENV !== "production"),
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5_000);
    if (times > 20) {
      console.error("[redis] Max reconnect attempts reached");
      return null;
    }
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
    return targetErrors.some((code) => err.message.includes(code));
  },
};

if (process.env.REDIS_TLS === "true") {
  redisConfig.tls = {};
}

const client = new Redis(redisConfig);

client.on("connect", () => {
  console.log("[redis] Connected");
});

client.on("error", (err) => {
  console.error("[redis] Error:", err.message);
});

client.on("reconnecting", () => {
  console.log("[redis] Reconnecting...");
});

const TTL = {
  SESSION: Number(process.env.REDIS_SESSION_TTL_SEC) || 86_400,
  REFRESH_DENYLIST: Number(process.env.REDIS_REFRESH_DENYLIST_TTL_SEC) || 604_800,
  ACCESS_DENYLIST: Number(process.env.REDIS_ACCESS_DENYLIST_TTL_SEC) || 900,
  OTP_RESET: Number(process.env.OTP_RESET_TTL_SEC) || 600,
  RATE_LIMIT_WINDOW: Number(process.env.REDIS_RATE_LIMIT_WINDOW_SEC) || 60,
  QR_SCAN_DEDUP: Number(process.env.REDIS_QR_SCAN_DEDUP_TTL_SEC) || 300,
};

const keys = {
  session: (sessionId) => `session:${sessionId}`,
  refreshDenylist: (tokenHash) => `refresh:deny:${tokenHash}`,
  accessDenylist: (jti) => `access:deny:${jti}`,
  otpReset: (email) => `otp:reset:${email.toLowerCase()}`,
  rateLimit: (scope, identifier) => `ratelimit:${scope}:${identifier}`,
  slidingRateLimit: (scope, identifier) => `ratelimit:sliding:${scope}:${identifier}`,
  qrScanDedup: (qrDataHash, scannerId) => `qr:scan:${qrDataHash}:${scannerId}`,
  invoiceSequence: (vendorCode, dateStr) => `invoice:seq:${vendorCode}:${dateStr}`,
};

/**
 * @param {string} sessionId
 * @param {object} payload
 * @param {number} [ttlSec]
 */
async function setSession(sessionId, payload, ttlSec = TTL.SESSION) {
  await client.setex(keys.session(sessionId), ttlSec, JSON.stringify(payload));
}

/**
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function getSession(sessionId) {
  const raw = await client.get(keys.session(sessionId));
  return raw ? JSON.parse(raw) : null;
}

/**
 * @param {string} sessionId
 */
async function deleteSession(sessionId) {
  await client.del(keys.session(sessionId));
}

/**
 * @param {string} tokenHash
 * @param {number} [ttlSec]
 */
async function denylistRefreshToken(tokenHash, ttlSec = TTL.REFRESH_DENYLIST) {
  await client.setex(keys.refreshDenylist(tokenHash), ttlSec, "1");
}

/**
 * @param {string} tokenHash
 * @returns {Promise<boolean>}
 */
async function isRefreshTokenDenied(tokenHash) {
  return (await client.exists(keys.refreshDenylist(tokenHash))) === 1;
}

/**
 * @param {string} scope
 * @param {string} identifier
 * @param {number} [windowSec]
 */
async function incrementRateLimit(scope, identifier, windowSec = TTL.RATE_LIMIT_WINDOW) {
  const key = keys.rateLimit(scope, identifier);
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, windowSec);
  }
  const ttl = await client.ttl(key);
  return { count, ttl };
}

/**
 * @param {string} scope
 * @param {string} identifier
 * @param {number} maxRequests
 * @param {number} [windowSec]
 */
async function checkRateLimit(scope, identifier, maxRequests, windowSec = TTL.RATE_LIMIT_WINDOW) {
  const { count, ttl } = await incrementRateLimit(scope, identifier, windowSec);
  return {
    allowed: count <= maxRequests,
    count,
    remaining: Math.max(0, maxRequests - count),
    resetInSec: ttl,
  };
}

/**
 * Sliding-window rate limit using a Redis sorted set (score = timestamp ms).
 * @param {string} scope
 * @param {string} identifier
 * @param {number} maxRequests
 * @param {number} windowSec
 * @returns {Promise<{ allowed: boolean, count: number, remaining: number, resetInSec: number }>}
 */
async function checkSlidingRateLimit(scope, identifier, maxRequests, windowSec) {
  const key = keys.slidingRateLimit(scope, identifier);
  const now = Date.now();
  const windowStart = now - windowSec * 1000;
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

  const pipeline = client.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, windowSec);
  const results = await pipeline.exec();

  const count = Number(results?.[2]?.[1] ?? 0);
  const allowed = count <= maxRequests;

  if (!allowed) {
    await client.zrem(key, member);
  }

  return {
    allowed,
    count: allowed ? count : count - 1,
    remaining: Math.max(0, maxRequests - (allowed ? count : count - 1)),
    resetInSec: windowSec,
  };
}

/**
 * @param {string} qrDataHash
 * @param {string} scannerId
 * @param {number} [ttlSec]
 * @returns {Promise<boolean>} true if first scan in window
 */
async function tryQrScanDedup(qrDataHash, scannerId, ttlSec = TTL.QR_SCAN_DEDUP) {
  const key = keys.qrScanDedup(qrDataHash, scannerId);
  const inserted = await client.set(key, Date.now().toString(), "EX", ttlSec, "NX");
  return inserted === "OK";
}

/**
 * @returns {Promise<boolean>}
 */
async function ping() {
  const result = await client.ping();
  return result === "PONG";
}

/**
 * Stores hashed OTP for password reset (never store plaintext OTP).
 * @param {string} email
 * @param {string} otpHash SHA-256 hex
 * @param {number} [ttlSec]
 */
async function setPasswordResetOtp(email, otpHash, ttlSec = TTL.OTP_RESET) {
  await client.setex(keys.otpReset(email), ttlSec, otpHash);
}

/**
 * @param {string} email
 * @returns {Promise<string|null>}
 */
async function getPasswordResetOtpHash(email) {
  return client.get(keys.otpReset(email));
}

/**
 * @param {string} email
 */
async function deletePasswordResetOtp(email) {
  await client.del(keys.otpReset(email));
}

/**
 * Blacklists a JWT access token by jti until natural expiry.
 * @param {string} jti
 * @param {number} ttlSec
 */
async function denylistAccessToken(jti, ttlSec = TTL.ACCESS_DENYLIST) {
  await client.setex(keys.accessDenylist(jti), ttlSec, "1");
}

/**
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
async function isAccessTokenDenied(jti) {
  return (await client.exists(keys.accessDenylist(jti))) === 1;
}

/**
 * Atomic daily sequence for system_invoice_id generation (thread-safe across workers).
 * @param {string} vendorCode
 * @param {string} dateStr YYYYMMDD
 * @returns {Promise<number>}
 */
async function incrementInvoiceSequence(vendorCode, dateStr) {
  const key = keys.invoiceSequence(vendorCode, dateStr);
  const seq = await client.incr(key);

  if (seq === 1) {
    await client.expire(key, 172_800);
  }

  return seq;
}

/**
 * @returns {Promise<void>}
 */
async function quit() {
  await client.quit();
}

export {
  client,
  keys,
  TTL,
  setSession,
  getSession,
  deleteSession,
  denylistRefreshToken,
  isRefreshTokenDenied,
  denylistAccessToken,
  isAccessTokenDenied,
  setPasswordResetOtp,
  getPasswordResetOtpHash,
  deletePasswordResetOtp,
  incrementRateLimit,
  checkRateLimit,
  checkSlidingRateLimit,
  tryQrScanDedup,
  incrementInvoiceSequence,
  ping,
  quit,
};
