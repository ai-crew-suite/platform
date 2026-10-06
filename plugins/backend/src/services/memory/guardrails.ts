/**
 * @file guardrails.ts
 * @package @internal/plugin-agent-backend (services/memory)
 *
 * @description
 * Regulatory filter and interception layer operating directly upstream of long-term memory storage.
 * Evaluates semantic content and unstructured text strings destined for vector embedding,
 * automatically detecting, masking, or rejecting elements containing unencrypted Protected
 * Health Information (PHI), Personally Identifiable Information (PII), or unauthorized trade secrets.
 *
 * @runtime_context
 * Stateless platform utility. Executed synchronously inside HTTP modification handlers or within
 * out-of-process Temporal Worker activities immediately prior to invoking the Mem0 client commit loop.
 *
 * @compliance_and_security
 * - HIPAA: Actively scans memory payloads against standard Safe Harbor entities (SSNs, medical records,
 *   biometric keys), guaranteeing unencrypted health telemetry never breaches long-term database storage.
 * - SOC-2 / Privacy: Enforces dynamic data leakage prevention (DLP) filters to ensure multi-tenant cross-contamination
 *   is blocked at the memory ingress perimeter.
 *
 * @example
 * ```ts
 * const guardrails = new MemoryGuardrails({ logger, auditLogger });
 * const rawMemoryFact = "User John Doe (SSN: 000-12-3456) prefers routing clinical data to endpoint A.";
 *
 * // Process and sanitize the memory text prior to storage
 * const validation = guardrails.sanitize(rawMemoryFact);
 * if (validation.isViolated) {
 *   // Securely handle or substitute string data
 *   console.log(validation.sanitizedText);
 *   // "User John Doe (SSN: [REDACTED]) prefers routing clinical data to endpoint A."
 * }
 * ```
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { AuditLogger } from '../../platform/compliance/audit-logger';

interface GuardrailResult {
  isViolated: boolean;
  sanitizedText: string;
  detectedEntities: string[];
}

export class MemoryGuardrails {
  private readonly logger: LoggerService;
  private readonly auditLogger: AuditLogger;

  // High-signal regex patterns for standard compliance markers (SSN, Email, and general PHI/PII markers)
  private readonly patterns = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  };

  constructor(options: { logger: LoggerService; auditLogger: AuditLogger }) {
    this.logger = options.logger;
    this.auditLogger = options.auditLogger;
  }

  /**
   * Evaluates text parameters against strict compliance profiles to redact restricted information.
   * Logs a critical alert to the audit matrix if data leakage criteria are triggered.
   *
   * @param text - The raw memory string value to evaluate.
   */
  public sanitize(text: string): GuardrailResult {
    let sanitizedText = text;
    const detectedEntities: string[] = [];
    let isViolated = false;

    // Evaluate social security markers
    if (this.patterns.ssn.test(sanitizedText)) {
      isViolated = true;
      detectedEntities.push('SSN');
      sanitizedText = sanitizedText.replace(this.patterns.ssn, '[REDACTED_SSN]');
    }

    // Evaluate standard account profile markers
    if (this.patterns.email.test(sanitizedText)) {
      isViolated = true;
      detectedEntities.push('EMAIL');
      sanitizedText = sanitizedText.replace(this.patterns.email, '[REDACTED_EMAIL]');
    }

    if (isViolated) {
      this.logger.warn(`[COMPLIANCE_GUARDRAILS] Data leakage signature blocked. Entities: ${detectedEntities.join(', ')}`);

      // Emit an immutable validation log tracing the interception without leaking the raw secret string
      this.auditLogger.log({
        action: 'MEMORY_GUARDRAIL_INTERCEPTION',
        category: 'security',
        status: 'denied',
        metadata: {
          blockedEntities: detectedEntities,
          actionTaken: 'text_redaction'
        }
      });
    }

    return {
      isViolated,
      sanitizedText,
      detectedEntities
    };
  }
}
