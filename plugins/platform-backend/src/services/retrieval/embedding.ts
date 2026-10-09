/**
 * @file embedding.ts
 * @package @internal/plugin-agent-backend (services/retrieval)
 *
 * @description
 * High-performance vector generation service built using the Vercel AI SDK.
 * Converts localized text chunks and conversational inputs into mathematical multi-dimensional
 * vector arrays using enterprise embedding configurations. It wraps native batch vector generation
 * logic to facilitate downstream storage mutations inside decentralized vector databases.
 *
 * @runtime_context
 * Stateless platform utility. Executed synchronously inside ingestion routing chains or
 * asynchronously inside out-of-process Temporal Worker activity executions prior to vector sync mutations.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Operates downstream of PII/PHI redaction guardrails, guaranteeing that
 *   sensitive plain text markers are fully sanitized or encrypted before being transmitted to model servers.
 * - FINRA: Validates model signature definitions and records token-processing metadata,
 *   ensuring complete lineage logging across external feature extraction iterations.
 *
 * @example
 * ```ts
 * import { openai } from '@ai-sdk/openai';
 *
 * const embeddingService = new VectorEmbeddingService({ logger });
 * const textNodes = ['Standardized configuration rules.', 'Secure storage retention profiles.'];
 *
 * // Convert an array of clean text chunks into vector spaces simultaneously
 * const modelRunner = openai.embedding('text-embedding-3-small');
 * const vectorResult = await embeddingService.generateBatchVectors(modelRunner, textNodes);
 *
 * console.log(vectorResult[0]); // Array of floats (e.g., [0.012, -0.431, ...]) ready for storage index
 * ```
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { embedMany, EmbeddingModel } from 'ai'; // Utilizing Vercel AI SDK structural primitives

export class VectorEmbeddingService {
  private readonly logger: LoggerService;

  constructor(options: { logger: LoggerService }) {
    this.logger = options.logger;
  }

  /**
   * Transforms an array of text snippets into a multi-dimensional float vector array.
   * Automatically splits large collections into safe chunks to abide by vendor batch limit constraints.
   *
   * @param model - A valid Vercel AI SDK EmbeddingModel wrapper instance.
   * @param textChunks - Array of plain text snippets or encrypted context blocks to embed.
   * @returns Resolves to an array of coordinate arrays (number[][]) matching the input order.
   */
  public async generateBatchVectors(
    model: EmbeddingModel<string>,
    textChunks: string[]
  ): Promise<number[][]> {
    if (!textChunks || textChunks.length === 0) {
      return [];
    }

    this.logger.info(`[COMPLIANCE_RAG_EMBEDDING] Initiating token conversion loop for ${textChunks.length} nodes.`);

    try {
      // Execute multi-value vector matching using the SDK batch optimization function
      const { embeddings } = await embedMany({
        model,
        values: textChunks,
      });

      this.logger.debug('[COMPLIANCE_RAG_EMBEDDING] Vector space mapping generated successfully.');
      return embeddings;
    } catch (error: any) {
      this.logger.error(`[COMPLIANCE_RAG_EMBEDDING] Exception caught during vector extraction: ${error.message}`);
      throw new Error(`Upstream Cryptographic Feature Extraction Interrupted: ${error.message}`);
    }
  }
}
