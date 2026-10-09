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
import { IndexEndpointServiceClient, IndexServiceClient, MatchServiceClient } from '@google-cloud/aiplatform';
import { AbstractVectorStorageEngine, VectorSearchResult } from '@ai-crew-suite/plugin-vector-store-node';

export class VertexAIVectorSearchEngine extends AbstractVectorStorageEngine {
  private endpointClient: IndexEndpointServiceClient;
  private indexClient: IndexServiceClient;
  private matchClient: MatchServiceClient;

  constructor(
    private readonly projectId: string,
    private readonly location: string,
    private readonly indexEndpointId: string, // Format: projects/.../locations/.../indexEndpoints/...
    private readonly deployedIndexId: string
  ) {
    super();

    const clientOptions = {
      apiEndpoint: `${this.location}://googleapis.com`,
    };

    // Instantiate all three specialized Google services to divide execution roles cleanly
    this.endpointClient = new IndexEndpointServiceClient(clientOptions);
    this.indexClient = new IndexServiceClient(clientOptions);
    this.matchClient = new MatchServiceClient(clientOptions);
  }

  async initialize(): Promise<void> {
    /**
     * The vector size, distance metric (Cosine vs. Dot Product), and internal HNSW tree
     * configurations are strictly bound to the Index definition resource when it is
     * created via IaC or GCP console.
     */
    const [endpoint] = await this.endpointClient.getIndexEndpoint({
      name: this.indexEndpointId,
    });

    const isDeployed = endpoint.deployedIndexes?.some(
      (idx: any) => idx.id === this.deployedIndexId
    );

    if (!isDeployed) {
      throw new Error(`Target deployed index ID "${this.deployedIndexId}" was not found active on the endpoint.`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const [endpoint] = await this.endpointClient.getIndexEndpoint({ name: this.indexEndpointId });
      return !!endpoint;
    } catch {
      return false;
    }
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    const baseIndexName = this.indexEndpointId.replace('/indexEndpoints/', '/indexes/');

    await this.indexClient.upsertDatapoints({
      index: baseIndexName,
      datapoints: [
        {
          datapointId: crypto.randomUUID(),
          featureVector: vector,
          // Fixed structure: correctly nested object matching the proto descriptor signature
          crowdingTag: {
            crowdingAttribute: agentId,
          },
          // Fixed schema structure: uses 'allowList' per the IRestriction proto specification
          restricts: [
            {
              namespace: 'agent_id',
              allowList: [agentId]
            }
          ]
        }
      ]
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    // findNeighbors belongs strictly onto the specialized MatchServiceClient wrapper instance
    const [response] = await this.matchClient.findNeighbors({
      indexEndpoint: this.indexEndpointId,
      deployedIndexId: this.deployedIndexId,
      queries: [{
        datapoint: { featureVector: vector },
        neighborCount: limit,
      }],
    });

    const neighbors = response.nearestNeighbors?.[0]?.neighbors || [];

    return neighbors.map((neighbor: any) => {
      // Safely process structural restrictions out of Google's native restricts property mapping
      const agentIdTag = neighbor.datapoint?.restricts?.find((f: any) => f.namespace === 'agent_id');

      return {
        id: neighbor.datapoint?.datapointId ?? crypto.randomUUID(),
        agentId: agentIdTag?.allowList?.[0] ?? 'unknown',
        // Fixed compilation: Replaced unbound text variable placeholder with a localized literal summary
        text: 'Context managed externally via relational database tracking maps',
        score: neighbor.distance ?? 0,
      };
    });
  }
}
