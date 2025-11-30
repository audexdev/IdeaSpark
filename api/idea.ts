import { VercelRequest, VercelResponse } from '@vercel/node';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HOUR_SECONDS = 60 * 60;
const IP_LIMIT = 20;
const COOKIE_LIMIT = 30;
const COMBINED_LIMIT = 50;
const IP_KEY_PREFIX = 'rl:ip:';
const COOKIE_KEY_PREFIX = 'rl:cookie:';
const COMBINED_KEY_PREFIX = 'rl:combined:';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const COOKIE_NAME = 'ideaspark_id';

type RateContext = {
  key: string;
  limit: number;
  ttlSeconds: number;
};

const parseBody = (req: VercelRequest): Record<string, unknown> => {
  if (!req.body) return {};
  if (Buffer.isBuffer(req.body)) {
    try {
      const text = req.body.toString('utf8');
      return JSON.parse(text);
    } catch (error) {
      console.warn('Failed to parse buffered request body', error);
      return {};
    }
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      console.warn('Failed to parse request body', error);
      return {};
    }
  }
  if (typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  return {};
};

const getClientIp = (req: VercelRequest): string => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  if (Array.isArray(realIp) && realIp.length > 0) return realIp[0];

  return req.socket?.remoteAddress || 'unknown';
};

const normalizeDeviceId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (HEX_64_REGEX.test(trimmed)) return trimmed.toLowerCase();
  if (UUID_REGEX.test(trimmed)) return trimmed.toLowerCase();
  return null;
};

const parseCookies = (req: VercelRequest): Record<string, string> => {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = rest.join('=');
    return acc;
  }, {});
};

const createCookie = (value: string) =>
  `${COOKIE_NAME}=${value}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;

const runUpstash = async (commands: (string | number)[]): Promise<number> => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis is not configured');
  }

  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([commands])
  });

  if (!response.ok) {
    throw new Error(`Upstash pipeline failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Unexpected Upstash response');
  }

  const result = data[0]?.result ?? data[0];
  return Number(result);
};

const runUpstashPipeline = async (commands: (string | number)[][]): Promise<number[]> => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis is not configured');
  }

  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error(`Upstash pipeline failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Upstash response');
  }

  return data.map((entry) => Number(entry?.result ?? entry));
};

const enforceRateLimit = async (context: RateContext) => {
  const [count, ttl] = await runUpstashPipeline([
    ['INCR', context.key],
    ['TTL', context.key]
  ]);

  if (!Number.isFinite(count)) {
    throw new Error('Invalid rate limit counter value');
  }

  let ttlSeconds = Number.isFinite(ttl) && ttl >= 0 ? ttl : context.ttlSeconds;

  // Ensure fixed window expiry is set
  if (count === 1 || ttl < 0) {
    await runUpstash(['EXPIRE', context.key, context.ttlSeconds]);
    ttlSeconds = context.ttlSeconds;
  }

  const allowed = count <= context.limit;
  const remainingMinutes = Math.max(0, Math.ceil(ttlSeconds / 60));

  return { allowed, remainingMinutes };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(req);
  const pickFirst = (value: unknown) => Array.isArray(value) ? value[0] : value;
  const rawCategory = pickFirst(body.category ?? req.query.category ?? 'ランダム');
  const category = typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : 'ランダム';
  const deviceId = pickFirst(body.deviceId ?? req.query.deviceId);
  const prompt = `今すぐやってみたくなる小さなアイデアを、1文で具体的に1つだけ出してください。カテゴリ: ${category}`;

  const cookies = parseCookies(req);
  let cookieDeviceId = cookies[COOKIE_NAME];
  let setCookieHeader: string | null = null;

  if (!cookieDeviceId) {
    try {
      const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      cookieDeviceId = uuid;
      setCookieHeader = createCookie(uuid);
    } catch (error) {
      console.warn('Failed to generate cookie id', error);
    }
  }

  try {
    const normalizedCombinedId = normalizeDeviceId(deviceId);
    let context: RateContext;

    if (normalizedCombinedId) {
      context = {
        key: `${COMBINED_KEY_PREFIX}${normalizedCombinedId}`,
        limit: COMBINED_LIMIT,
        ttlSeconds: HOUR_SECONDS
      };
    } else if (cookieDeviceId) {
      context = {
        key: `${COOKIE_KEY_PREFIX}${cookieDeviceId}`,
        limit: COOKIE_LIMIT,
        ttlSeconds: HOUR_SECONDS
      };
    } else {
      context = {
        key: `${IP_KEY_PREFIX}${getClientIp(req)}`,
        limit: IP_LIMIT,
        ttlSeconds: HOUR_SECONDS
      };
    }

    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }

    const rate = await enforceRateLimit(context);

    if (!rate.allowed) {
      res.status(429).json({ error: 'rate_limit', remaining: rate.remainingMinutes });
      return;
    }
  } catch (error) {
    console.error('Rate limit error', error);
    res.status(500).json({ error: 'Internal Server Error.' });
    return;
  }

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await geminiRes.json();
    console.log("Gemini raw response:", JSON.stringify(data, null, 2));
    const idea = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(`Extracted idea: ${idea}`);

    if (idea) {
      res.status(200).json({ idea });
    } else {
      res.status(500).json({ error: 'Failed to extract idea.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error.' });
  }
}
