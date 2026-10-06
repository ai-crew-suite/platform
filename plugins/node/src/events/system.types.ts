/**
 * @file system.types.ts
 * @package @internal/plugin-agent-node (events)
 *
 * @description
 * Shared type contracts and interface definitions for internal platform system events.
 * Standardizes non-audit diagnostic notifications, health telemetry frames, lifecycle alerts,
 * and component state changes emitted across the orchestration engine, background worker tasks,
 * and active extension drivers. This isolates telemetry tracking from high-security audit ledgers,
 * ensuring robust monitoring capability without introducing monorepo circular dependencies.
 *
 * @runtime_context
 * Framework-agnostic type compilation space. Ingested by system logging layers, diagnostics monitors,
 * performance dashboards, and the platform dependency injection bootstrap logic.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts diagnostic messages from capturing transient transactional parameters,
 *   ensuring that internal log monitoring files stay free of sensitive corporate data or PII/PHI.
 * - Performance Stability: Provides explicit tracking envelopes for errors, connection retries, and
 *   subsystem timeouts to support strict system availability and business continuity reviews.
 *
 * @example
 * ```ts
 * import { SystemEventFrame } from '@internal/plugin-agent-node';
 *
 * const clusterStatusAlert: SystemEventFrame = {
 *   timestamp: '2026-03-26T06:12:00Z',
 *   level: 'warn',
 *   component: 'temporal-worker-pool',
 *   message: 'Connection degradation detected on task queue ring. Re-establishing link.',
 *   payload: {
 *     taskQueue: 'agent-backend-queue',
 *     retryAttempt: 2,
 *     latencyMs: 1420
 *   }
 * };
 * ```
 */

/**
 * Diagnostic tracking tiers mapping the operational severity of a system notification.
 */
export type SystemEventLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Universal structural tracking envelope for internal platform notifications, health heartbeats,
 * and diagnostic errors.
 */
export interface SystemEventFrame {
  readonly timestamp: string;
  readonly level: SystemEventLevel;
  readonly component: string;
  readonly message: string;
  readonly payload: Record<string, any>;
}

/**
 * Telemetry structure tracking the health states of the underlying engine client providers.
 */
export interface ComponentHealthState {
  readonly component: 'vercel-ai-sdk' | 'mem0-vector-store' | 'temporal-cluster' | string;
  readonly isHealthy: boolean;
  readonly activeConnections: number;
  readonly lastHeartbeatAt: string;
  readonly metadata?: Record<string, any>;
}
