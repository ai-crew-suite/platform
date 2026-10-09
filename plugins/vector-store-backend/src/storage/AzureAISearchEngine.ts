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
import { SearchIndexClient, SearchClient, AzureKeyCredential } from '@azure/search-documents';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class AzureAISearchEngine extends AbstractVectorStorageEngine {
  private indexClient: SearchIndexClient;
  private searchClient: SearchClient<any>;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly indexName: string = 'backstage-agent-memories'
  ) {
    super();

    const credential = new AzureKeyCredential(this.apiKey);
    this.indexClient = new SearchIndexClient(this.endpoint, credential);
    this.searchClient = new SearchClient<any>(this.endpoint, this.indexName, credential);
  }

  async initialize(): Promise<void> {
    // 1. Attempt to find the pre-existing vector tracking index layout
    const indexes = this.indexClient.listIndexes();
    let exists = false;

    for await (const index of indexes) {
      if (index.name === this.indexName) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      // 2. Deploy a complete Azure search tracking schema definition layout
      await this.indexClient.createIndex({
        name: this.indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true },
          { name: 'agentId', type: 'Edm.String', searchable: true, filterable: true },
          { name: 'text', type: 'Edm.String', searchable: true },
          {
            name: 'embedding',
            type: 'Collection(Edm.Single)', // Single precision float array container match
            searchable: true,
            vectorSearchDimensions: 1536,
            vectorSearchProfileName: 'backstage-hnsw-profile',
          },
        ],
        vectorSearch: {
          profiles: [
            {
              name: 'backstage-hnsw-profile',
              algorithmConfigurationName: 'backstage-hnsw-algo',
            },
          ],
          algorithms: [
            {
              name: 'backstage-hnsw-algo',
              kind: 'hnsw',
              parameters: {
                metric: 'cosine',
                m: 4,
                efConstruction: 400,
              },
            },
          ],
        },
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    // Use indexClient rather than searchClient to fetch management metrics
    const statistics = await this.indexClient.getIndexStatistics(this.indexName);
    return !!statistics;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    // Upload or merge actions push vectors directly into the search index profile mapping
    await this.searchClient.uploadDocuments([
      {
        id: crypto.randomUUID(),
        agentId,
        text,
        embedding: vector,
      },
    ]);
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    const searchResults = await this.searchClient.search('*', {
      vectorSearchOptions: {
        queries: [
          {
            kind: 'vector',
            vector: vector,
            fields: ['embedding'],
            kNearestNeighborsCount: limit,
          },
        ],
      },
    });

    const normalized: VectorSearchResult[] = [];
    for await (const result of searchResults.results) {
      normalized.push({
        id: result.document.id,
        agentId: result.document.agentId,
        text: result.document.text,
        score: result.score, // Azure tracks similarity rankings perfectly out of the box
      });
    }
    return normalized;
  }
}
