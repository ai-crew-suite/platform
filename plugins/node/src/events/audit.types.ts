/**
 * @file audit.types.ts
 * @package @internal/plugin-agent-node (events)
 *
 * @description
 * Shared type contracts and interface definitions for system-wide auditing events.
 * This file serves as the strict, immutable data contract that standardizes compliance logs
 * across the main orchestration engine, out-of-process Temporal worker pools, and downstream
 * driver modules. Placing these schemas in the shared node package prevents circular dependency loops
 * and ensures any module or pluggable driver can format auditable telemetry that fits
 * enterprise logging constraints.
 *
 * @runtime_context
 * Framework-agnostic type compilation space. Ingested by the unified platform logger
 * (`platform/compliance/audit-logger.ts`) and individual asynchronous runtime task layers.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts metadata structures from capturing raw PHI/PII strings by dictating
 *   explicit summary metadata templates, satisfying system observability constraints.
 * - FINRA: Establishes rigid requirements for cryptographic trace tracking, sub-millisecond sequencing,
 *   and system action schemas to support unalterable WORM (Write Once Read Many) digital recording audits.
 *
 * @example
 * ```ts
 * import { PlatformAuditEvent, AuditCategory } from '@internal/plugin-agent-node';
 *
 * const storageAuditRecord: PlatformAuditEvent = {
 *   eventId: 'evt_78234-90ab-cdef',
 *   timestamp: '2026-03-26T06:10:00Z',
 *   category: 'security',
 *   action: 'VECTOR_INDEX_ACCESS',
 *   status: 'success',
 *   telemetry: {
 *     correlationId: 'trace_01g89234xj',
 *     actor: 'user:default/john-doe',
 *     principalType: 'user'
 *   },
 *   details: {
 *     targetCollection: 'compliance_vault',
 *     recordsReturned: 3
 *   }
 * };
 * ```
 */

/**
 * Categorical breakdown classifying the primary compliance domain of the log event.
 */
export type AuditCategory =
  | 'authentication'
  | 'workflow'
  | 'llm'
  | 'data-retrieval'
  | 'security';

/**
 * Standard status tracking flags documenting the outcome of the audited transaction.
 */
export type AuditStatus = 'success' | 'failure' | 'denied';

/**
 * Telemetry context structure tracking distributed lineage across different network, process,
 * and thread boundaries.
 */
export interface DistributedTraceContext {
  readonly correlationId: string;
  readonly actor: string;
  readonly principalType: 'user' | 'service';
  readonly tenantScope?: string;
}

/**
 * Universal, high-integrity structural blueprint schema for every compliance log event
 * generated across the platform ecosystem.
 */
export interface PlatformAuditEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly category: AuditCategory;
  readonly action: string;
  readonly status: AuditStatus;
  readonly telemetry: DistributedTraceContext;
  readonly details: Record<string, any>;
}
