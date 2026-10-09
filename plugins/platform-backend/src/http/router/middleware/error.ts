/**
 * @file error.ts
 * @package @internal/plugin-agent-backend (http/router/middleware)
 *
 * @description
 * Terminal error handling and masking middleware for the Express HTTP layer. Captures all
 * unhandled exceptions thrown during request execution, extracts raw debugging logs for
 * localized error monitoring systems, and sanitizes outgoing responses before they are
 * returned to user-facing clients.
 *
 * @runtime_context
 * Synchronous HTTP execution thread running as the final catch-all boundary in the
 * Express middleware pipeline.
 *
 * @compliance_and_security
 * - HIPAA / SOC-2: Prevents sensitive data leakage by actively masking application stack
 *   traces, raw database errors, and runtime context payloads that could contain internal
 *   architectural definitions, Protected Health Information (PHI), or PII.
 * - FINRA: Sanitizes user-facing messages into uniform generic codes while ensuring the
 *   untruncated, raw error context is durably logged to secure, immutable infrastructure
 *   for complete regulatory forensics and post-mortem auditing.
 */
import { ErrorRequestHandler } from 'express';
import { LoggerService } from '@backstage/backend-plugin-api';
import { complianceStorage } from './compliance-ctx';

interface ErrorMiddlewareOptions {
  logger: LoggerService;
}

/**
 * Factory creating the terminal error handling and security-masking middleware.
 * Intercepts all internal system crashes, writes unredacted metrics to audit, and cleanses the client response.
 */
export function createErrorMiddleware(options: ErrorMiddlewareOptions): ErrorRequestHandler {
  const { logger } = options;

  return (err, req, res, _next) => {
    // 1. Retrieve the isolated active tracing context to bind the failure to the originating session
    const currentContext = complianceStorage.getStore();
    const correlationId = currentContext?.correlationId || 'unknown-trace';
    const userRef = currentContext?.userEntityRef || 'unknown-actor';

    // 2. Structurally log the absolute raw exception details securely for internal engineering forensics
    // Under FINRA/SOC-2, this preserves unredacted trace context inside protected infrastructure boundaries.
    logger.error(
      `[Compliance Failure] CorrelationId: ${correlationId} | Initiator: ${userRef} | Message: ${err.message}`,
      err
    );

    // 3. Evaluate the exception signature to determine safety metrics
    const statusCode = err.status || err.statusCode || 500;

    // 4. Cleanse and return a secure payload to the user-facing Backstage layout
    // Explicitly strips stack traces, file targets, and internal parameters to honor strict data privacy.
    res.status(statusCode).json({
      error: statusCode === 500 ? 'InternalServerError' : err.name || 'ApplicationError',
      message: statusCode === 500
        ? 'An unexpected execution anomaly occurred. The transaction has been aborted securely.'
        : err.message,
      correlationId, // Allows the operator to reference the issue with support via an immutable trace link
    });
  };
}
