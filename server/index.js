import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import xaiRoutes from './routes/xai.js';
import openaiRoutes from './routes/openai.js';
import ultravoxRoutes from './routes/ultravox.js';
import retellRoutes from './routes/retell.js';
import geminiRoutes from './routes/gemini.js';
import sixtydbRoutes from './routes/sixtydb.js';
import functionsRoutes from './routes/functions.js';
import { attachSixtyDbTtsRelay } from './ws/sixtydb-tts.js';
import {
  REQUEST_ID_HEADER,
  createRequestLoggingMiddleware,
  isMetricsEnabled,
  isRequestLoggingEnabled,
  requestMetrics,
} from './utils/observability.js';
import {
  TOKEN_ENDPOINT_PATHS,
  createCorsOriginDelegate,
  createInFlightRequestGuard,
  createJsonErrorHandler,
  createSecurityHeadersMiddleware,
  getJsonBodyLimit,
  getSecurityPosture,
  mapProviderError,
  validateProductionSecurityConfig,
} from './utils/security.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load base environment variables first
config();

// Demo mode: load .env.demo on top of .env if it exists
// This allows ngrok URLs to override CORS_ORIGIN dynamically
const envDemoPath = join(__dirname, '.env.demo');
if (existsSync(envDemoPath)) {
  config({ path: envDemoPath, override: true });
  console.log('[Server] Demo mode: loaded .env.demo overrides');
}

// Demo mode flag from environment
const isDemoMode = process.env.DEMO_MODE === 'true';
const isProduction = process.env.NODE_ENV === 'production';
const jsonBodyLimit = getJsonBodyLimit();
const securityConfig = validateProductionSecurityConfig({
  nodeEnv: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,
  isDemoMode,
  allowLocalhostProductionOrigins: process.env.ALLOW_LOCALHOST_PRODUCTION_CORS === 'true',
});

if (isProduction && !securityConfig.ok) {
  console.error('[Server] Unsafe production security configuration:', securityConfig.issues.join('; '));
}

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the 100 requests in 15 minutes limit. Please try again later.',
    retryAfter: '15 minutes',
  },
});

// Stricter rate limit for token endpoints (ephemeral tokens)
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 token requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many token requests',
    message: 'You have exceeded the 10 token requests per minute limit.',
    retryAfter: '1 minute',
  },
});

// Rate limit for static file serving (SPA fallback)
const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for static file requests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Too many static file requests. Please try again later.',
    retryAfter: '15 minutes',
  },
});

const app = express();
app.disable('x-powered-by');

const PORT = process.env.SERVER_PORT || 3001;
const startTime = Date.now();
const distPath = join(__dirname, '..', 'dist');
const indexPath = join(distPath, 'index.html');
const tokenInFlightGuard = createInFlightRequestGuard();

function isEnvConfigured(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function createProviderStatus(requiredEnv) {
  const missing = requiredEnv.filter(name => !isEnvConfigured(name));

  return {
    configured: missing.length === 0,
    missing,
  };
}

function getProviderServices() {
  return {
    elevenlabs: createProviderStatus(['ELEVENLABS_API_KEY', 'VITE_ELEVENLABS_AGENT_ID']),
    sixtydb: createProviderStatus(['SIXTYDB_API_KEY', 'ANTHROPIC_API_KEY']),
    openai: createProviderStatus(['OPENAI_API_KEY']),
    xai: createProviderStatus(['XAI_API_KEY']),
    ultravox: createProviderStatus(['ULTRAVOX_API_KEY']),
    vapi: createProviderStatus(['VITE_VAPI_WEB_TOKEN']),
    retell: createProviderStatus(['RETELL_API_KEY']),
    gemini: createProviderStatus(['GEMINI_API_KEY']),
  };
}

function getProviderSummary(services) {
  const total = Object.keys(services).length;
  const configured = Object.values(services).filter(service => service.configured).length;

  return {
    total,
    configured,
    unconfigured: total - configured,
  };
}

function getHealthStatus({ isAppReady, providerSummary }) {
  if (!isAppReady) {
    return 'unhealthy';
  }

  if (providerSummary.configured === providerSummary.total) {
    return 'healthy';
  }

  return 'degraded';
}

function getHealthMessage({ status, providerSummary, isStaticReady, isSecurityReady }) {
  if (status === 'unhealthy') {
    if (!isSecurityReady) {
      return 'Production security configuration is unsafe.';
    }

    return isStaticReady
      ? 'Application readiness failed.'
      : 'Production static assets are missing or unavailable.';
  }

  if (status === 'degraded') {
    return `Application is serving, but ${providerSummary.unconfigured} of ${providerSummary.total} providers are not fully configured.`;
  }

  return 'Application is serving and all provider runtime variables are configured.';
}

function getObservabilityStatus() {
  const frontendErrorTrackingProvider =
    process.env.VITE_ERROR_TRACKING_PROVIDER || 'console';
  const frontendErrorTrackingRequested =
    process.env.VITE_ERROR_TRACKING_ENABLED === 'true' &&
    frontendErrorTrackingProvider !== 'console';

  return {
    requestIds: {
      enabled: true,
      header: REQUEST_ID_HEADER,
    },
    requestLogging: {
      enabled: isRequestLoggingEnabled(),
      sink: 'stdout',
    },
    metrics: {
      enabled: isMetricsEnabled(),
      endpoint: '/api/metrics',
      storage: 'in-memory',
    },
    frontendErrorTracking: {
      status: 'deferred',
      provider: frontendErrorTrackingProvider,
      externalReportingEnabled: false,
      externalServiceStatus: frontendErrorTrackingRequested ? 'deferred' : 'not-configured',
      fallback: 'structured-console',
    },
    uptimeMonitoring: {
      configured: isEnvConfigured('UPTIME_MONITOR_URL'),
      alertDestinationConfigured: isEnvConfigured('UPTIME_ALERT_DESTINATION'),
    },
  };
}

function parseMetricsQuery(query) {
  const allowedKeys = new Set(['details']);
  const unknownKeys = Object.keys(query).filter(key => !allowedKeys.has(key));

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unsupported metrics query parameter: ${unknownKeys[0]}`,
    };
  }

  const details = query.details;
  if (details === undefined) {
    return { ok: true, includeRoutes: false };
  }

  if (details === 'true') {
    return { ok: true, includeRoutes: true };
  }

  if (details === 'false') {
    return { ok: true, includeRoutes: false };
  }

  return {
    ok: false,
    error: 'Metrics query parameter "details" must be "true" or "false".',
  };
}

// Middleware
app.use(createSecurityHeadersMiddleware({ isProduction }));
app.use(cors({
  origin: createCorsOriginDelegate(securityConfig),
  credentials: true,
  optionsSuccessStatus: 204,
}));
// Attach request IDs, request completion logs, and in-memory API metrics before
// JSON parsing so malformed body failures are also traceable.
app.use('/api', createRequestLoggingMiddleware());
app.use(express.json({ limit: jsonBodyLimit, strict: true }));
app.use(createJsonErrorHandler());

// Compression for all responses (improves static file delivery)
app.use(compression());

// Serve static files in production mode (BEFORE API routes)
if (isProduction) {
  app.use(express.static(distPath));
  console.log(`[Server] Serving static files from: ${distPath}`);
}

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Apply stricter rate limiting to token endpoints
for (const tokenEndpointPath of TOKEN_ENDPOINT_PATHS) {
  app.use(tokenEndpointPath, tokenLimiter, tokenInFlightGuard);
}

// API Routes
app.use('/api/xai', xaiRoutes);
app.use('/api/openai', openaiRoutes);
app.use('/api/ultravox', ultravoxRoutes);
app.use('/api/retell', retellRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/60db', sixtydbRoutes);
app.use('/api/functions', functionsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;
  const services = getProviderServices();
  const providerSummary = getProviderSummary(services);
  const isStaticReady = !isProduction || existsSync(indexPath);
  const isSecurityReady = securityConfig.ok;
  const isAppReady = isStaticReady && isSecurityReady;
  const status = getHealthStatus({ isAppReady, providerSummary });
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  const message = getHealthMessage({
    status,
    providerSummary,
    isStaticReady,
    isSecurityReady,
  });
  const security = getSecurityPosture({
    securityConfig,
    isProduction,
    isDemoMode,
    jsonBodyLimit,
  });

  const healthResponse = {
    requestId: req.requestId,
    status,
    ready: isAppReady,
    message,
    statusMapping: {
      healthy: 'Application is serving and all provider runtime variables are configured.',
      degraded: 'Application is serving, but one or more providers are not configured.',
      unhealthy: 'Application is not ready to serve production traffic.',
    },
    timestamp: new Date().toISOString(),
    uptime: {
      ms: uptimeMs,
      formatted: `${Math.floor(uptimeMs / 1000 / 60)} minutes`,
    },
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV || 'development',
      pid: process.pid,
      processUptimeSeconds: Math.floor(process.uptime()),
      staticAssets: {
        required: isProduction,
        ready: isStaticReady,
        indexPath: isStaticReady ? 'available' : 'missing',
      },
      readiness: {
        app: isAppReady,
        staticAssets: isStaticReady,
        security: isSecurityReady,
        providersConfigured: providerSummary.configured,
        providersTotal: providerSummary.total,
      },
    },
    providerSummary,
    services,
    security,
    observability: getObservabilityStatus(),
    version: process.env.npm_package_version || '1.0.0',
  };

  res.status(httpStatus).json(healthResponse);
});

// Metrics endpoint for lightweight production diagnostics
app.get('/api/metrics', (req, res) => {
  if (!isMetricsEnabled()) {
    return res.status(503).json({
      requestId: req.requestId,
      status: 'disabled',
      message: 'Metrics endpoint is disabled by METRICS_ENABLED=false.',
    });
  }

  const options = parseMetricsQuery(req.query);
  if (!options.ok) {
    return res.status(400).json({
      requestId: req.requestId,
      error: 'Invalid metrics query',
      message: options.error,
    });
  }

  res.json({
    requestId: req.requestId,
    status: 'ok',
    metrics: requestMetrics.getSnapshot({ includeRoutes: options.includeRoutes }),
  });
});

// Get signed URL for ElevenLabs conversation
app.get('/api/elevenlabs/signed-url', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.VITE_ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    console.error('[Server] ELEVENLABS_API_KEY is not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'API key not configured'
    });
  }

  if (!agentId) {
    console.error('[Server] VITE_ELEVENLABS_AGENT_ID is not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Agent ID not configured'
    });
  }

  try {
    console.log(`[Server] Requesting signed URL for agent: ${agentId.substring(0, 10)}...`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`[Server] ElevenLabs API error: ${response.status}`);
      return res.status(response.status).json({
        ...mapProviderError('ElevenLabs', response.status),
      });
    }

    const data = await response.json();
    console.log('[Server] Signed URL generated successfully');

    res.json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error('[Server] Error getting signed URL:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get ElevenLabs signed URL'
    });
  }
});

// SPA fallback: serve index.html for all non-API routes in production
// This must come AFTER all API routes
// Express 5 requires named wildcards - use {*path} syntax
if (isProduction) {
  app.get('{*path}', staticLimiter, (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api')) {
      res.sendFile(indexPath);
    }
  });
}

const server = app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Mode: ${isProduction ? 'production' : 'development'}${isDemoMode ? ' (demo)' : ''}`);
  console.log(`[Server] CORS origins: ${securityConfig.origins.join(', ') || 'none'}`);
  if (isDemoMode) {
    console.log('[Server] Demo mode: CORS configured for ngrok tunnel');
  }
  console.log(`[Server] 60db API key: ${process.env.SIXTYDB_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] Anthropic (Claude) API key: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] ElevenLabs API key: ${process.env.ELEVENLABS_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] ElevenLabs Agent ID: ${process.env.VITE_ELEVENLABS_AGENT_ID ? 'Yes' : 'No'}`);
  console.log(`[Server] xAI API key: ${process.env.XAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] OpenAI API key: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] Ultravox API key: ${process.env.ULTRAVOX_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] Retell API key: ${process.env.RETELL_API_KEY ? 'Yes' : 'No'}`);
  console.log(`[Server] Gemini API key: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'}`);
});

// Attach the 60db streaming TTS WebSocket relay to the same HTTP server so the
// 60db API key stays server-side (browser connects to /api/60db/tts).
attachSixtyDbTtsRelay(server, {
  allowedOrigins: securityConfig.origins,
  isProduction,
});
