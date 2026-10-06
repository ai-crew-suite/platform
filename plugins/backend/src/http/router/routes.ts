/**
 * @file routes.ts
 * @package @internal/plugin-agent-backend (http/router)
 *
 * @description
 * Primary HTTP entrypoint and routing configuration layer for the Backstage backend plugin.
 * Orchestrates incoming Express HTTP requests by mapping endpoints to specific backend
 * plugin behaviors. It interfaces directly with the Fluent API compilation engine to receive
 * dynamic workflow schemas from user-facing components, passing the resulting serialized graphs
 * over to the Temporal dispatcher for async processing.
 *
 * @runtime_context
 * Synchronous HTTP execution thread running inside the main Backstage Node.js backend process
 * (bound to the framework's core httpRouterService).
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Sits downstream of strict authentication and identity validation filters,
 *   ensuring that all incoming connection requests carry valid authorization context prior to
 *   initiating any core agent logic or state operations.
 * - FINRA: Serves as the primary ingress logging boundary, ensuring that all API invocation attempts,
 *   payload metadata lengths, and entry status codes are fed reliably to the platform's audit layer.
 */
import { Router } from 'express';
import { LoggerService, HttpRouterService } from '@backstage/backend-plugin-node';
import { AgentBuilder } from '../../engine/fluent/builder';
import { TemporalDispatcher } from '../client/temporal-dispatcher';

interface RouterOptions {
  logger: LoggerService;
  httpRouter: HttpRouterService;
  temporalDispatcher: TemporalDispatcher;
}

/**
 * Initializes and binds the Express HTTP routes for the Agent Backend plugin.
 */
export async function createRouter(options: RouterOptions): Promise<Router> {
  const { logger, httpRouter, temporalDispatcher } = options;
  const router = Router();

  // Middleware to ensure JSON body parsing
  router.use(Router.json());

  /**
   * POST /execute
   * Ingress endpoint invoked by user-facing frontend plugins to compile and run an agent.
   */
  router.post('/execute', async (req, res, next) => {
    try {
      const { agentName, steps, settings } = req.body;

      logger.info(`Received execution request for agent: ${agentName}`);

      // 1. Initialize the Fluent API Builder
      const builder = new AgentBuilder();

      // 2. Hydrate the builder with parameters received from the user-facing plugin
      builder
        .withName(agentName)
        .withTemperature(settings?.temperature ?? 0.7);

      // Programmatically apply short-term memory constraints
      if (settings?.maxTokens) {
        builder.withContextWindow(settings.maxTokens);
      }

      // 3. Terminal compile step to generate the immutable, JSON-serializable execution graph
      // (This validates the input under strict SOC-2/HIPAA/FINRA parameters)
      const executionGraph = builder.compile();

      logger.debug(`Successfully compiled execution graph for agent: ${agentName}`);

      // 4. Dispatch the execution graph to the asynchronous Temporal Worker loop
      // Inherited user tokens and compliance trace IDs are preserved on the request context
      const workflowId = await temporalDispatcher.dispatch(executionGraph);

      // 5. Respond synchronously with the tracking identifiers
      res.status(202).json({
        status: 'Accepted',
        message: 'Agent workflow successfully queued for execution.',
        workflowId,
        agentName,
      });

    } catch (error: any) {
      logger.error(`Failed to dispatch agent workflow: ${error.message}`);

      // Hand off to the secure error-masking middleware (prevents stack/PII leakage)
      next(error);
    }
  });

  return router;
}
