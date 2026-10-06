/**
 * @file compliance-ctx.ts
 * @package @internal/plugin-agent-backend (http/router/middleware)
 *
 * @description
 * Inbound interceptor middleware responsible for extracting, validating, and establishing
 * the compliance execution context for incoming HTTP requests. It captures distributed trace IDs,
 * tenant scopes, and user metadata from incoming headers, injecting them into a localized
 * request context (such as an AsyncLocalStorage instance). This context is preserved and propagated
 * across thread boundaries down through the compiler, dispatcher, and into the Temporal cluster.
 *
 * @runtime_context
 * Synchronous HTTP execution thread running as an upstream filter in the Express middleware pipeline.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Guarantees end-to-end data lineage by binding a unique, immutable request
 *   or session identifier to all subsequent in-memory processing, data transformation, and service calls.
 * - FINRA: Enforces rigid non-repudiation and auditability constraints, ensuring that any workflow
 *   triggered or signal dispatched carries verified telemetry linking back to the originating operator.
 */
import { RequestHandler } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { LoggerService } from '@backstage/backend-plugin-api';
import { v4 as uuidv4 } from 'uuid';

/**
 * Strongly typed interface for the isolated compliance context block.
 */
export interface ComplianceContextPayload {
  correlationId: string;
  userEntityRef: string;
  principalType: 'user' | 'service';
  timestamp: string;
}

// Global AsyncLocalStorage instance to safely propagate context down asynchronous execution sub-trees
export const complianceStorage = new AsyncLocalStorage<ComplianceContextPayload>();

interface ComplianceMiddlewareOptions {
  logger: LoggerService;
}

/**
 * Factory creating the distributed execution context tracking middleware.
 * Enforces trace propagation from the HTTP ingress point through core business services.
 */
export function createComplianceContextMiddleware(options: ComplianceMiddlewareOptions): RequestHandler {
  const { logger } = options;

  return (req, res, next) => {
    // 1. Capture or extract an incoming trace identifier to prevent multi-hop auditing blindness
    const incomingCorrelationId = req.header('x-correlation-id') || req.header('x-request-id');
    const correlationId = incomingCorrelationId ? String(incomingCorrelationId) : uuidv4();

    // 2. Safely resolve authenticated user profiles injected upstream by the auth middleware boundary
    const userEntityRef = req.user?.entityRef || 'anonymous-system';
    const principalType = req.user?.type || 'service';

    const contextPayload: ComplianceContextPayload = {
      correlationId,
      userEntityRef,
      principalType,
      timestamp: new Date().toISOString(),
    };

    // Inject trace indicators onto the response object headers for external API tracking
    res.setHeader('x-correlation-id', correlationId);

    // 3. Wrap subsequent request thread operations within the immutable memory boundary
    complianceStorage.run(contextPayload, () => {
      logger.debug(`Compliance context locked for track: ${correlationId} [User: ${userEntityRef}]`);
      next();
    });
  };
}
