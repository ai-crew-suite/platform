/**
 * @file index.ts
 * @package @internal/plugin-agent-node (root)
 *
 * @description
 * Primary public entrypoint and barrel export module for the shared agent platform `bridge` package.
 * Consolidates and exposes all core typescript definitions, public contracts, structural blueprints,
 * extension points, and parameter validation utilities. This package serves as the immutable dependency
 * surface imported by both the core execution backend (`engine`) and all external user-facing
 * dynamic agent plugins, ensuring uniform typing across split runtime environments.
 *
 * @runtime_context
 * Global compilation and dependency resolution boundary. Executed synchronously during project build step
 * packaging or dynamic model evaluation runs across multi-monorepo boundaries.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Locks down public contract shapes, ensuring metadata fields, data isolation schemas,
 *   and trace keys cannot be arbitrarily altered or re-declared by downstream plugin contributors.
 * - FINRA: Seals the unified serialization schema contract structures (`fluent-api.types.ts`), guaranteeing
 *   absolute telemetry data alignment and version compliance for system reporting layers.
 *
 * @example
 * ```ts
 * // Within an external user-facing agent workflow plugin package:
 * import {
 *   AgentBuilderContract,
 *   storageDriverBlueprint,
 *   validateAgentName
 * } from '@internal/plugin-agent-node';
 *
 * // Complete type-safety, blueprint compliance, and structural validations are accessible instantly
 * ```
 */

// 1. Export Public Core API Contracts & Type Maps
export * from './api/context.types';
export * from './api/fluent-api.types';

// 2. Export Pluggable Modular Integration Blueprints
export * from './blueprints/platform-driver.blueprint';
export * from './blueprints/security-driver.blueprint';
export * from './blueprints/storage-driver.blueprint';

// 3. Export Unified Cross-Plugin Compliance Event Formats
export * from './events/audit.types';
export * from './events/system.types';
export * from './events/workflow.types';

// 4. Export Backstage Dependency Injection Extension Point Tokens
export * from './extension-points/platform-driver.extension-point';
export * from './extension-points/security-driver.extension-point';
export * from './extension-points/storage-driver.extension-point';

// 5. Export Shared Structural Parameter Validation Utilities
export * from './utils/validation';
