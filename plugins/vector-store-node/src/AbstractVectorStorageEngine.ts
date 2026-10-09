/*
 * Copyright 2026 The AI Crew Suite Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  AsymmetricSearchOptions,
  VectorSearchResult,
  VectorStorageEngine,
} from './types';

export abstract class AbstractVectorStorageEngine implements VectorStorageEngine {
  /**
   * Every engine driver must implement its own native connection initialization logic.
   */
  abstract initialize(): Promise<void>;

  /**
   * Every engine driver must implement its own native health checking loop.
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Every engine driver must implement its own native vector upsert logic.
   */
  abstract addMemory(agentId: string, text: string, vector: number[]): Promise<void>;

  /**
   * Every engine driver must implement its own mathematical nearest-neighbor lookup loop.
   */
  abstract searchSimilar(vector: number[], limit: number): Promise<VectorSearchResult[]>;

  /**
   * Shared orchestration utility: Automatically handles converting string queries into float
   * vectors via a callback before executing the native searchSimilar pipeline.
   */
  async searchAsymmetric(
    options: AsymmetricSearchOptions,
    embedder: (text: string) => Promise<number[]>
  ): Promise<VectorSearchResult[]> {
    const targetVector = await embedder(options.text);
    return this.searchSimilar(targetVector, options.limit ?? 5);
  }
}
