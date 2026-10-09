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
// plugins/vector-store-backend/src/storageFactory.ts
import { Config } from "@backstage/config";
import { Knex } from "knex";
import { VectorStorageEngine } from "@ai-crew-suite/plugin-vector-store-node";
import { MilvusEngine } from "./storage/MilvusEngine";
import { PgVectorEngine } from "./storage/PgVectorEngine";
import { QdrantEngine } from "./storage/QdrantEngine";
import { PineconeEngine } from "./storage/PineconeEngine";
import { AzureAISearchEngine } from "./storage/AzureAISearchEngine";
import { AwsOpenSearchEngine } from "./storage/AwsOpenSearchEngine";
import { VertexAIVectorSearchEngine } from "./storage/VertexAIVectorSearchEngine";

/**
 * Instantiates the specified core vector infrastructure driver.
 */
export async function createVectorEngine(
  engineType: string,
  config: Config,
  knex: Knex
): Promise<VectorStorageEngine> {
  switch (engineType) {
    case 'milvus': {
      const address = config.getString('vectorStore.milvus.address');
      const user = config.getOptionalString('vectorStore.milvus.username');
      const pass = config.getOptionalString('vectorStore.milvus.password');
      return new MilvusEngine(address, user, pass);
    }
    case 'qdrant': {
      const qdrantUrl = config.getString('vectorStore.qdrant.url');
      return new QdrantEngine(qdrantUrl);
    }

    case 'pinecone': {
      const apiKey = config.getString('vectorStore.pinecone.apiKey');
      const environment = config.getString('vectorStore.pinecone.environment');
      return new PineconeEngine(apiKey, environment);
    }

    case 'azureai': {
      const endpoint = config.getString('vectorStore.azureai.endpoint');
      const apiKey = config.getString('vectorStore.azureai.apiKey');
      return new AzureAISearchEngine(endpoint, apiKey);
    }

    case 'gcp-vertex':
      return new VertexAIVectorSearchEngine(
        config.getString('vectorStore.gcp.projectId'),
        config.getString('vectorStore.gcp.location'),
        config.getString('vectorStore.gcp.indexEndpointId'),
        config.getString('vectorStore.gcp.deployedIndexId')
      );

    case 'aws-opensearch':
      return new AwsOpenSearchEngine(
        config.getString('vectorStore.aws.nodeUrl'),
        config.getOptionalString('vectorStore.aws.username'),
        config.getOptionalString('vectorStore.aws.password')
      );

    case 'pgvector':
    default:
      return new PgVectorEngine(knex);
  }
}
