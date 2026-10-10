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
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import {
  vectorStoreServiceRef,
  VectorEngineBuilder,
} from '@ai-crew-suite/plugin-vector-store-node';
import { createVectorEngine } from './storageFactory';

/**
 * Internal static registry to hold third-party vector database extensions
 * while bypassing service factory property constraints.
 */
export class VectorProviderRegistry {
  private static providers = new Map<string, VectorEngineBuilder>();

  static register(type: string, builder: VectorEngineBuilder) {
    this.providers.set(type.toLowerCase(), builder);
  }

  static get(type: string): VectorEngineBuilder | undefined {
    return this.providers.get(type.toLowerCase());
  }

  static has(type: string): boolean {
    return this.providers.has(type.toLowerCase());
  }
}

/**
 * Main Service Factory connecting the Vector Engine ecosystem to the Backstage DI Container
 */
export const vectorStoreServiceFactory = createServiceFactory({
  service: vectorStoreServiceRef,
  deps: {
    config: coreServices.rootConfig,
    database: coreServices.database,
    logger: coreServices.logger,
  },
  async factory({ config, database, logger }) {
    const engineType = config.getOptionalString('vectorStore.type')?.toLowerCase() || 'pgvector';

    logger.info(`Vector Store Service Factory invoked for plugin target. Selected engine configuration: [${engineType}]`);

    // 1. Resolve and get the client connection
    const knex = await database.getClient();

    // 2. Check if a third-party developer registered a matching driver via the extension point
    if (VectorProviderRegistry.has(engineType)) {
      logger.info(`Matching custom third-party vector engine extension discovered for: [${engineType}]`);

      const customBuilder = VectorProviderRegistry.get(engineType)!;
      const customEngine = await customBuilder(config, knex);

      logger.info(`Initializing custom third-party engine: [${engineType}]...`);
      await customEngine.initialize();

      logger.info(`Custom third-party vector engine [${engineType}] initialized successfully.`);
      return customEngine;
    }

    // 3. Fall back to initializing a built-in infrastructure provider
    logger.info(`Initializing core built-in infrastructure driver for: [${engineType}]`);
    const builtInEngine = await createVectorEngine(engineType, config, knex);

    logger.info(`Executing boot-up schema migrations/collection assertions for built-in engine: [${engineType}]...`);
    await builtInEngine.initialize();

    logger.info(`Core built-in Vector Storage engine [${engineType}] is running healthy and active.`);
    return builtInEngine;
  },
});
