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
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { vectorStoreExtensionPoint } from '@ai-crew-suite/plugin-vector-store-node';
import { VectorProviderRegistry } from './serviceFactory';

export const vectorStorePlugin = createBackendPlugin({
  pluginId: 'vector-store',
  async register(env) {
    env.registerExtensionPoint(vectorStoreExtensionPoint, {
      registerProvider(type, builder) {
        VectorProviderRegistry.register(type, builder);
      },
    });

    env.registerInit({
      deps: {},
      async init() {
        /**
         * Left empty intentionally. The master engine lifecycle startup checks,
         * migrations, and API allocations are handled by vectorStoreServiceFactory.
         */
      },
    });
  },
});
