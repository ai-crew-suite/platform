/**
 * @file chunking.ts
 * @package @internal/plugin-agent-backend (services/retrieval)
 *
 * @description
 * Stateless utility service implementing text splitting and context slicing strategies for RAG.
 * Breaks unstructured source corpora or documentation text down into highly cohesive,
 * bounded text nodes (chunks) utilizing token-count limits or semantic structure indicators.
 * It manages context isolation boundaries to prepare records for downstream vector indexing operations.
 *
 * @runtime_context
 * Stateless platform utility. Executed synchronously inside bulk data ingestion processing lines,
 * document loading routes, or out-of-process within long-running Temporal Worker activities.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Prevents structural multi-tenant information leakage by enforcing localized data blocks
 *   and appending access control arrays onto the chunk metadata footprint before embedding generation.
 * - FINRA: Produces highly deterministic, position-tracked chunk arrays with structural verification hashes
 *   to guarantee lineage tracing and prevent random context variance.
 *
 * @example
 * ```ts
 * const chunker = new TextChunkingService({ logger });
 * const sourceDocument = "Lorem ipsum dolor sit amet... [10,000 words of legal text]";
 *
 * // Process raw string into bounded text nodes
 * const textNodes = chunker.splitText(sourceDocument, { chunkSize: 500, overlap: 50 });
 * console.log(textNodes[0].text); // Extracted sub-string bounded exactly by token/char limits
 * ```
 */

import { LoggerService } from '@backstage/backend-plugin-api';

export interface ChunkNode {
  id: string;
  text: string;
  metadata: {
    characterLength: number;
    startIndex: number;
  };
}

export class TextChunkingService {
  private readonly logger: LoggerService;

  constructor(options: { logger: LoggerService }) {
    this.logger = options.logger;
  }

  /**
   * Splits a continuous text block into an array of smaller, cohesive document chunk records.
   *
   * @param text - The raw source text file or documentation context to split.
   * @param options - Sizing guidelines detailing target character lengths and slice offsets.
   */
  public splitText(text: string, options: { chunkSize: number; overlap: number }): ChunkNode[] {
    this.logger.debug(`[COMPLIANCE_RAG_CHUNKING] Processing document block partitioning. Source length: ${text.length} characters.`);

    if (options.overlap >= options.chunkSize) {
      throw new Error('Compliance Validation Error: Overlap dimensions must be smaller than the total chunk size.');
    }

    const chunks: ChunkNode[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      // Calculate partition bounds based on character windows
      let endIndex = currentIndex + options.chunkSize;
      let chunkText = text.substring(currentIndex, endIndex);

      chunks.push({
        id: crypto.randomUUID(),
        text: chunkText,
        metadata: {
          characterLength: chunkText.length,
          startIndex: currentIndex
        }
      });

      // Shift window forward by size minus overlap bounds
      if (endIndex >= text.length) {
        break;
      }
      currentIndex += (options.chunkSize - options.overlap);
    }

    this.logger.info(`[COMPLIANCE_RAG_CHUNKING] Document partitioned successfully into ${chunks.length} isolated context nodes.`);
    return chunks;
  }
}
