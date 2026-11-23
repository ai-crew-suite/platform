# Default Tool Drivers

| **Category** | **Default Tool** |
| --- | --- |
| `approval` | **Gotify** |
| `booking` | **Cal.com** or **Radicale** |
| `cd` | **Argo CD**  |
| `ci` | **Woodpecker CI** or **Drone CI** |
| `communication` | **Mattermost** or **Zulip** |
| `documentation` | **Outline** or **Wiki.js** |
| `email` | **Mailpit** |
| `featureflags` | **Flagsmith** or **Flipt** |
| `finops` | **OpenCost** |
| `incidents` | **GoAlert** or **Grafana OnCall** |
| `infrastructure` | **OpenTofu** (via **Atlantis**) or **OpenBao** |
| `observability` | **Grafana** + **VictoriaMetrics** / **Prometheus** |
| `scm` | **Gitea** or **Forgejo** |
| `scorecards` | **Backstage Soundcheck / Tech Insights** or **OpenSSF Scorecard** |
| `security` | **Trivy** + **Dependency-Track** |
| `testing` | **Allure Docker Service** or **Kiwi TCMS** |
| `ticketing` | **Plane** or **Vikunja** |

For each of these categories, I've included the intents used by the Conduit project to show what actions each tool should implement as a base. The types these are derived from are in `/home/kevin/Repos/sol-duara/conduit-go/pkg/seat/catalogue.go`. Note that `finops` and `scorecards` are additions to the Conduit categories, so the category semantics added is specific to this project.

## `approval`

**Default Tool:** Gotify
**License:** MIT
**Why:** For an external REST target, Gotify provides a lightweight webhook/approval endpoint.
**Example Tools:** Harness CD Approval Gates

**Category Semantics:**

- **No Routing (`Destination`):** None of the intents carry a `Destination`. `requestId` and `workflowId` identify existing approval/workflow objects, while `approverId` and `approvers` name the people acting on the gate.
- **Gate vs. Notification:** Unlike `sendApprovalRequest` in `communication` (which notifies reviewers via chat), `requestApproval` interacts directly with the approval gate itself.
- **Audit Trail:** `approveRequest` and `rejectRequest` explicitly capture both the actor (`approverId`) and their rationale (`comment` / `reason`).

| Intent (`Seat`)           | Parameters (`Args`)                  | Destination | Slot Fill Constraints                                        |
| ------------------------- | ------------------------------------ | ----------- | ------------------------------------------------------------ |
| `requestApproval`         | `workflowId`, `context`              | —           | `workflowId`: `FillAny` `context`: `FillAny`                 |
| `approveRequest`          | `requestId`, `approverId`, `comment` | —           | `requestId`: `FillAny` `approverId`: `FillAny` `comment`: `FillAny` |
| `rejectRequest`           | `requestId`, `approverId`, `reason`  | —           | `requestId`: `FillAny` `approverId`: `FillAny` `reason`: `FillAny` |
| `getApprovalStatus`       | `requestId`                          | —           | `requestId`: `FillAny`                                       |
| `addApprovalComment`      | `requestId`, `comment`               | —           | `requestId`: `FillAny` `comment`: `FillAny`                  |
| `cancelApprovalRequest`   | `requestId`, `reason`                | —           | `requestId`: `FillAny` `reason`: `FillAny`                   |
| `reassignApprovalRequest` | `requestId`, `approvers`             | —           | `requestId`: `FillAny` `approvers`: `FillAny`                |
| `escalateApprovalRequest` | `requestId`, `level`                 | —           | `requestId`: `FillAny` `level`: `FillAny`                    |
| `closeApprovalRequest`    | `requestId`, `outcome`               | —           | `requestId`: `FillAny` `outcome`: `FillAny`                  |

## `artifact`

**Default Tool:** Zot
**License:** Apache 2.0
**Why:** Zot is a single, tiny Go binary/container implementing the OCI Distribution spec with Bearer/OAuth2 auth.
**Example Tools:** Artifactory, Harbor

**Category Semantics:**

- **Routing (`Destination`):** `repository` (in `publishArtifact`) and `targetRepo` (in `promoteArtifact`) act as routing destinations (`FillNone`), naming the target registry/repository where the artifact lands.
- **Target Objects & Fill Classes:** `artifactId` identifies an existing artifact object (`FillSpecific`), whereas `artifact` uses `FillRange` (`["artifactId", "artifact"]`) to accept either a resolved identifier or an artifact reference from event payloads.

| Intent (`Seat`)              | Parameters (`Args`)                  | Destination  | Slot Fill Constraints                                        |
| ---------------------------- | ------------------------------------ | ------------ | ------------------------------------------------------------ |
| `publishArtifact`            | `artifact`, `repository`, `metadata` | `repository` | `artifact`: `FillRange` (`["artifactId", "artifact"]`) `repository`: `FillNone` `metadata`: `FillAny` |
| `getArtifact`                | `artifactId`                         | —            | `artifactId`: `FillSpecific` (`["artifactId"]`)              |
| `signArtifact`               | `artifactId`, `signature`            | —            | `artifactId`: `FillSpecific` (`["artifactId"]`) `signature`: `FillAny` |
| `verifyArtifactSignature`    | `artifactId`                         | —            | `artifactId`: `FillSpecific` (`["artifactId"]`)              |
| `promoteArtifact`            | `artifactId`, `targetRepo`           | `targetRepo` | `artifactId`: `FillSpecific` (`["artifactId"]`) `targetRepo`: `FillNone` |
| `deleteArtifact`             | `artifactId`                         | —            | `artifactId`: `FillSpecific` (`["artifactId"]`)              |
| `getArtifactVulnerabilities` | `artifactId`                         | —            | `artifactId`: `FillSpecific` (`["artifactId"]`)              |
| `listArtifactVersions`       | `artifact`                           | —            | `artifact`: `FillRange` (`["artifactId", "artifact"]`)       |
| `tagArtifact`                | `artifactId`, `tags`                 | —            | `artifactId`: `FillSpecific` (`["artifactId"]`) `tags`: `FillAny` |
| `attachArtifactEvidence`     | `artifactId`, `kind`, `document`     | —            | `artifactId`: `FillSpecific` (`["artifactId"]`) `kind`: `FillAny` `document`: `FillAny` |
| `pinArtifact`                | `artifactId`, `reason`               | —            | `artifactId`: `FillSpecific` (`["artifactId"]`) `reason`: `FillAny` |

## `booking`

**Default Tool:** Cal.com or Radicale
**License:** AGPL-3.0 / GPL-3.0
**Why:** Cal.com exposes a modern REST API and OAuth2 flows for room/resource scheduling. Radicale is an ultra-lightweight CalDAV server if you want zero-overhead calendar/resource testing.
**Example Tools:** Exchange room mailboxes, Google Workspace calendar resources, Robin, Envoy

**Category Semantics:**

- **Routing (`Destination`):** Only `location` (in `findAvailable`) acts as a routing destination (`FillNone`), naming a building, campus, or zone so per-principal overrides can route availability queries to the appropriate workplace/room booking system.
- **Target Objects & Data:** `resourceId` and `bookingId` identify existing objects (`FillAny`), while `service` in `requestService` refers to a facility/hospitality service request on a booking rather than an on-call routing destination.

| Intent (`Seat`)   | Parameters (`Args`)                      | Destination | Slot Fill Constraints                                        |
| ----------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------ |
| `findAvailable`   | `kind`, `capacity`, `window`, `location` | `location`  | `kind`: `FillAny` `capacity`: `FillAny` `window`: `FillAny` `location`: `FillNone` |
| `bookResource`    | `resourceId`, `window`, `purpose`        | —           | `resourceId`: `FillAny` `window`: `FillAny` `purpose`: `FillAny` |
| `getBooking`      | `bookingId`                              | —           | `bookingId`: `FillAny`                                       |
| `modifyBooking`   | `bookingId`, `window`                    | —           | `bookingId`: `FillAny` `window`: `FillAny`                   |
| `cancelBooking`   | `bookingId`, `reason`                    | —           | `bookingId`: `FillAny` `reason`: `FillAny`                   |
| `listBookings`    | `selector`, `window`                     | —           | `selector`: `FillAny` `window`: `FillAny`                    |
| `addAttendees`    | `bookingId`, `attendees`                 | —           | `bookingId`: `FillAny` `attendees`: `FillAny`                |
| `requestService`  | `bookingId`, `service`, `details`        | —           | `bookingId`: `FillAny` `service`: `FillAny` `details`: `FillAny` |
| `checkIn`         | `bookingId`                              | —           | `bookingId`: `FillAny`                                       |
| `releaseResource` | `bookingId`, `reason`                    | —           | `bookingId`: `FillAny` `reason`: `FillAny`                   |

## `cd`

**Default Tool:** Argo CD
**License:** Apache 2.0
**Why:** Industry standard for Kubernetes CD, ships with a clean REST/gRPC API, native OIDC/OAuth2 token support, and runs well in a single-node Kind/K3d or Compose setup.
**Example Tools:** ArgoCD, Flux, Spinnaker

**Category Semantics:**

- **Routing (`Destination`):** Every intent that accepts an `environment` slot uses it as a routing destination (`FillNone`), allowing per-principal overrides to target specific clusters or CD instances per environment.
- **Category Boundary:** `scaleService` is deliberately excluded here because adjusting replica counts is an infrastructure/resource act rather than a deployment act.
- **Open Fill Constraints:** Unlike `ci` or `ticketing`, object identifiers (`serviceId`, `deploymentId`) here use `FillAny` rather than `FillSpecific`.

| Intent (`Seat`)       | Parameters (`Args`)                         | Destination   | Slot Fill Constraints                                        |
| --------------------- | ------------------------------------------- | ------------- | ------------------------------------------------------------ |
| `deployService`       | `serviceId`, `environment`, `version`       | `environment` | `serviceId`: `FillAny` `environment`: `FillNone` `version`: `FillAny` |
| `rollbackService`     | `serviceId`, `environment`, `targetVersion` | `environment` | `serviceId`: `FillAny` `environment`: `FillNone` `targetVersion`: `FillAny` |
| `getDeploymentStatus` | `deploymentId`                              | —             | `deploymentId`: `FillAny`                                    |
| `pauseDeployment`     | `deploymentId`                              | —             | `deploymentId`: `FillAny`                                    |
| `resumeDeployment`    | `deploymentId`                              | —             | `deploymentId`: `FillAny`                                    |
| `getServiceHealth`    | `serviceId`, `environment`                  | `environment` | `serviceId`: `FillAny` `environment`: `FillNone`             |
| `syncService`         | `serviceId`, `environment`                  | `environment` | `serviceId`: `FillAny` `environment`: `FillNone`             |
| `cancelDeployment`    | `deploymentId`                              | —             | `deploymentId`: `FillAny`                                    |
| `getDeployedVersion`  | `serviceId`, `environment`                  | `environment` | `serviceId`: `FillAny` `environment`: `FillNone`             |

## `ci`

**Default Tool:** Woodpecker CI or Drone CI
**License:** Apache 2.0
**Why:** Lightweight, container-native CI with a clean REST API and native OAuth2 integration with Gitea. (Alternatively, Gitea Actions reuses your Gitea container).
**Example Tools:** GitHub Actions, Jenkins, CircleCI, Buildkite

**Category Semantics:**

- **Routing (`Destination`):** Only `environment` acts as a routing destination (`FillNone`), matching `deployService` by naming which target environment a build is promoted to so per-principal overrides can route it.
- **Target Objects:** `pipelineId` and `buildId` identify existing objects within a single CI tool (`FillSpecific`) and are not routing destinations.

| Intent (`Seat`)     | Parameters (`Args`)      | Destination   | Slot Fill Constraints                                        |
| ------------------- | ------------------------ | ------------- | ------------------------------------------------------------ |
| `triggerBuild`      | `pipelineId`, `params`   | —             | `pipelineId`: `FillSpecific` (`["pipelineId"]`) `params`: `FillAny` |
| `cancelBuild`       | `buildId`                | —             | `buildId`: `FillSpecific` (`["buildId"]`)                    |
| `getBuildStatus`    | `buildId`                | —             | `buildId`: `FillSpecific` (`["buildId"]`)                    |
| `getBuildArtifacts` | `buildId`                | —             | `buildId`: `FillSpecific` (`["buildId"]`)                    |
| `retryBuild`        | `buildId`                | —             | `buildId`: `FillSpecific` (`["buildId"]`)                    |
| `promoteBuild`      | `buildId`, `environment` | `environment` | `buildId`: `FillSpecific` (`["buildId"]`) `environment`: `FillNone` |
| `getBuildLogs`      | `buildId`, `step`        | —             | `buildId`: `FillSpecific` (`["buildId"]`) `step`: `FillAny`  |

## `communication`

**Default Tool:** Mattermost or Zulip
**License:** MIT / Apache 2.0
**Why:** Mattermost (Team Edition) runs in a single container + Postgres, acts as a drop-in Slack API equivalent, and natively supports OAuth2 apps and personal access tokens.
**Example Tools:** Zulip, Mattermost, Slack

**Category Semantics:**

- **Routing (`Destination`):** `channel` and `userId` act as routing destinations (`FillNone`) for per-principal tool overrides.
- **Target Objects vs. Data:** `threadRef` and `messageRef` identify existing chat objects (`FillSpecific`), while `approvers`, `members`, `name`, `purpose`, `topic`, and `message` act as payload data (`FillAny`).
- **Approval Distinction:** `sendApprovalRequest` delivers a notification to human reviewers over a chat tool, whereas `requestApproval` (in the `approval` category) interacts directly with the approval gate.

| Intent (`Seat`)       | Parameters (`Args`)      | Destination | Slot Fill Constraints                                        |
| --------------------- | ------------------------ | ----------- | ------------------------------------------------------------ |
| `notifyChannel`       | `channel`, `message`     | `channel`   | `channel`: `FillNone` `message`: `FillAny`                   |
| `notifyUser`          | `userId`, `message`      | `userId`    | `userId`: `FillNone` `message`: `FillAny`                    |
| `sendApprovalRequest` | `approvers`, `context`   | —           | `approvers`: `FillAny` `context`: `FillAny`                  |
| `replyInThread`       | `threadRef`, `message`   | —           | `threadRef`: `FillSpecific` (`["threadRef"]`) `message`: `FillAny` |
| `updateMessage`       | `messageRef`, `message`  | —           | `messageRef`: `FillSpecific` (`["messageRef"]`) `message`: `FillAny` |
| `reactToMessage`      | `messageRef`, `reaction` | —           | `messageRef`: `FillSpecific` (`["messageRef"]`) `reaction`: `FillAny` |
| `createChannel`       | `name`, `purpose`        | —           | `name`: `FillAny` `purpose`: `FillAny`                       |
| `inviteToChannel`     | `channel`, `members`     | `channel`   | `channel`: `FillNone` `members`: `FillAny`                   |
| `setChannelTopic`     | `channel`, `topic`       | `channel`   | `channel`: `FillNone` `topic`: `FillAny`                     |
| `archiveChannel`      | `channel`                | `channel`   | `channel`: `FillNone`                                        |

## `documentation`

**Default Tool:** Outline or Wiki.js
**License:** BSL / AGPL-3.0
**Why:** Outline provides a Notion-like REST/RPC API and native OAuth2 provider support (great for testing user-delegated token scopes). Wiki.js offers a clean GraphQL API with MIT/AGPL licensing.
**Example Tools:** Zulip, Mattermost, Slack

**Category Semantics:**

- **Routing (`Destination`):** Only `location` (a space, folder, or parent page) acts as a routing destination (`FillNone`), allowing per-principal overrides to route creation or search calls to the right documentation backend or workspace.
- **Format & Target Objects:** `content` slots carry Markdown (translated by the underlying tool/fulfiller), and `documentId` identifies an existing page/document object (`FillAny`).

| Intent (`Seat`)              | Parameters (`Args`)                       | Destination | Slot Fill Constraints                                        |
| ---------------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------ |
| `createDocument`             | `title`, `content`, `location`            | `location`  | `title`: `FillAny` `content`: `FillAny` `location`: `FillNone` |
| `createDocumentFromTemplate` | `template`, `title`, `values`, `location` | `location`  | `template`: `FillAny` `title`: `FillAny` `values`: `FillAny` `location`: `FillNone` |
| `findDocument`               | `query`, `location`                       | `location`  | `query`: `FillAny` `location`: `FillNone`                    |
| `getDocument`                | `documentId`                              | —           | `documentId`: `FillAny`                                      |
| `appendToDocument`           | `documentId`, `content`                   | —           | `documentId`: `FillAny` `content`: `FillAny`                 |
| `replaceDocumentSection`     | `documentId`, `section`, `content`        | —           | `documentId`: `FillAny` `section`: `FillAny` `content`: `FillAny` |
| `attachToDocument`           | `documentId`, `file`, `description`       | —           | `documentId`: `FillAny` `file`: `FillAny` `description`: `FillAny` |
| `setTableRow`                | `documentId`, `table`, `key`, `values`    | —           | `documentId`: `FillAny` `table`: `FillAny` `key`: `FillAny` `values`: `FillAny` |
| `addDocumentComment`         | `documentId`, `comment`                   | —           | `documentId`: `FillAny` `comment`: `FillAny`                 |

## `email`

**Default Tool:** Mailpit
**License:** MIT
**Why:** Single-binary SMTP + REST API server built specifically for local Docker testing—captures outbound emails and lets your test suite query/assert sent messages via HTTP API.
**Example Tools:** Amazon SES, Microsoft 365, Google Workspaces

**Category Semantics:**

- **Routing & Recipients:** Recipient addresses are strictly bound by routing configuration, never via seat arguments. Because most seats declare no arguments (`Args: ""`), the subscriber gate refuses all event-mapping keys structurally.
- **Naming Convention:** `replyInMailThread` explicitly includes `"Mail"` to avoid colliding with `replyInThread` in the `communication` category (which targets a chat thread).

| Intent (`Seat`)        | Parameters (`Args`)  | Destination | Slot Fill Constraints                        |
| ---------------------- | -------------------- | ----------- | -------------------------------------------- |
| `sendMail`             | —                    | —           | *(No slots; all event mapping keys refused)* |
| `replyInMailThread`    | —                    | —           | *(No slots; all event mapping keys refused)* |
| `sendDigest`           | `window`             | —           | `window`: `FillAny`                          |
| `sendCalendarInvite`   | `startsAt`, `endsAt` | —           | `startsAt`: `FillAny` `endsAt`: `FillAny`    |
| `cancelCalendarInvite` | —                    | —           | *(No slots; all event mapping keys refused)* |

## `featureflags`

**Default Tool:** Flagsmith or Flipt
**License:** BSD-3 / GPL-3.0
**Why:** Flipt is a single, fast Go container with native OpenFeature SDK support and clean REST/gRPC management APIs. Flagsmith is great if you want a full admin UI alongside OpenFeature.
**Example Tools:** Flagsmith, OpenFeature

**Category Semantics:**

- **Routing (`Destination`):** `environment` acts as a routing destination (`FillNone`), matching `cd` and `observability` so per-principal overrides can direct flag changes or status checks to the right environment instance.
- **Target Objects & Rollouts:** `featureId` identifies the flag object (`FillAny`). Note that `setFeatureRollout` omits `environment` and carries no destination.

| Intent (`Seat`)     | Parameters (`Args`)        | Destination   | Slot Fill Constraints                            |
| ------------------- | -------------------------- | ------------- | ------------------------------------------------ |
| `enableFeature`     | `featureId`, `environment` | `environment` | `featureId`: `FillAny` `environment`: `FillNone` |
| `disableFeature`    | `featureId`, `environment` | `environment` | `featureId`: `FillAny` `environment`: `FillNone` |
| `setFeatureRollout` | `featureId`, `percentage`  | —             | `featureId`: `FillAny` `percentage`: `FillAny`   |
| `getFeatureStatus`  | `featureId`, `environment` | `environment` | `featureId`: `FillAny` `environment`: `FillNone` |

## `finops`

**Default Tool:** OpenCost
**License:** Apache 2.0
**Why:** CNCF incubating standard (the open-source core behind Kubecost) with a lightweight container and clean REST API for querying cluster/namespace cost allocations.
**Example Tools:** CloudCost, Kubecost

**Category Semantics:**

- **Routing (`Destination`):** `scope` (a cluster, billing account, or cloud subscription) acts as the routing destination (`FillNone`), allowing per-principal or Backstage entity overrides to route cost queries and budget actions to the appropriate OpenCost/Kubecost/CloudCost instance without binding dynamically from event payloads.
- **Target Objects & Queries:** `budgetId`, `recommendationId`, and `anomalyId` identify existing FinOps objects (`FillAny`), while `aggregation`, `window`, `filter`, and `threshold` act as query or configuration data (`FillAny`).
- **Default Tool:** OpenCost (Apache 2.0) — CNCF standard with a lightweight REST API for cluster/namespace allocation queries; extensible to Kubecost and CloudCost for multi-cloud billing, budgets, and savings recommendations.

| Intent (`Seat`)              | Parameters (`Args`)                        | Destination | Slot Fill Constraints                                        |
| ---------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------------ |
| `getCostAllocation`          | `scope`, `window`, `aggregation`, `filter` | `scope`     | `scope`: `FillNone` `window`: `FillAny` `aggregation`: `FillAny` `filter`: `FillAny` |
| `getAssetCosts`              | `scope`, `window`, `filter`                | `scope`     | `scope`: `FillNone` `window`: `FillAny` `filter`: `FillAny`  |
| `getCloudCosts`              | `scope`, `window`, `aggregation`, `filter` | `scope`     | `scope`: `FillNone` `window`: `FillAny` `aggregation`: `FillAny` `filter`: `FillAny` |
| `getCostForecast`            | `scope`, `window`, `filter`                | `scope`     | `scope`: `FillNone` `window`: `FillAny` `filter`: `FillAny`  |
| `getCostAnomalies`           | `scope`, `window`, `severity`              | `scope`     | `scope`: `FillNone` `window`: `FillAny` `severity`: `FillAny` |
| `acknowledgeCostAnomaly`     | `anomalyId`, `reason`                      | —           | `anomalyId`: `FillAny` `reason`: `FillAny`                   |
| `getBudgetStatus`            | `budgetId`                                 | —           | `budgetId`: `FillAny`                                        |
| `setBudgetThreshold`         | `scope`, `filter`, `threshold`, `period`   | `scope`     | `scope`: `FillNone` `filter`: `FillAny` `threshold`: `FillAny` `period`: `FillAny` |
| `getSavingsRecommendations`  | `scope`, `kind`, `filter`                  | `scope`     | `scope`: `FillNone` `kind`: `FillAny` `filter`: `FillAny`    |
| `applySavingsRecommendation` | `recommendationId`                         | —           | `recommendationId`: `FillAny`                                |

## `incidents`

**Default Tool:** GoAlert or Grafana OnCall
**License:** Apache 2.0 / AGPL-3.0
**Why:** GoAlert (built by Target) is an open-source PagerDuty alternative with on-call schedules, escalation policies, and GraphQL/REST APIs in a lightweight Go container.
**Example Tools:** PagerDuty, OpsGenie

**Category Semantics:**

- **Category Separation:** Split out from `communication` because incident management tools (e.g., PagerDuty, Opsgenie) own incident objects, whereas chat tools (e.g., Slack) reject them.
- **Routing (`Destination`):** Only `service` acts as a routing destination (`FillNone`), identifying which on-call service is paged or queried so per-principal overrides can redirect it.
- **Target Objects:** `incidentId` identifies an existing incident object (`FillSpecific`).

| Intent (`Seat`)       | Parameters (`Args`)                         | Destination | Slot Fill Constraints                                        |
| --------------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `createIncident`      | `severity`, `data`                          | —           | `severity`: `FillAny` `data`: `FillAny`                      |
| `acknowledgeIncident` | `incidentId`                                | —           | `incidentId`: `FillSpecific` (`["incidentId"]`)              |
| `resolveIncident`     | `incidentId`, `resolution`                  | —           | `incidentId`: `FillSpecific` (`["incidentId"]`) `resolution`: `FillAny` |
| `escalateIncident`    | `incidentId`, `level`                       | —           | `incidentId`: `FillSpecific` (`["incidentId"]`) `level`: `FillAny` |
| `addIncidentNote`     | `incidentId`, `message`                     | —           | `incidentId`: `FillSpecific` (`["incidentId"]`) `message`: `FillAny` |
| `pageOnCall`          | `service`, `summary`, `severity`, `details` | `service`   | `service`: `FillNone` `summary`: `FillAny` `severity`: `FillAny` `details`: `FillAny` |
| `getOnCall`           | `service`                                   | `service`   | `service`: `FillNone`                                        |
| `getOpenIncidents`    | `service`                                   | `service`   | `service`: `FillNone`                                        |
| `getIncidentStatus`   | `incidentId`                                | —           | `incidentId`: `FillSpecific` (`["incidentId"]`)              |

## `infrastructure`

**Default Tool:** OpenTofu (via Atlantis) or OpenBao
**License:** MPL-2.0 / Apache 2.0
**Why:** Atlantis gives you a stateful GitOps REST/webhook runner for OpenTofu/Terraform plans and applies. Pair with OpenBao (Linux Foundation fork of Vault) for secrets/KMS simulation.
**Example Tools:** Terraform, Pulumi, Crossplane, Humanitec, Vault

**Category Semantics:**

- **No Routing (`Destination`):** None of the intents carry a `Destination`. Unlike `cd`'s bare `environment` (which names a target routing destination), `environmentId` here is an opaque identifier for an existing provisioned resource, and `secretPath` identifies a specific secret object.
- **Open Fill Constraints:** All slots use `FillAny`, allowing event payloads to pass resource IDs, specs, change sets, or secret paths directly.

| Intent (`Seat`)        | Parameters (`Args`)        | Destination | Slot Fill Constraints                           |
| ---------------------- | -------------------------- | ----------- | ----------------------------------------------- |
| `provisionEnvironment` | `spec`                     | —           | `spec`: `FillAny`                               |
| `destroyEnvironment`   | `environmentId`            | —           | `environmentId`: `FillAny`                      |
| `getEnvironmentStatus` | `environmentId`            | —           | `environmentId`: `FillAny`                      |
| `updateInfrastructure` | `environmentId`, `changes` | —           | `environmentId`: `FillAny` `changes`: `FillAny` |
| `getSecret`            | `secretPath`               | —           | `secretPath`: `FillAny`                         |
| `rotateSecret`         | `secretPath`               | —           | `secretPath`: `FillAny`                         |

## `observability`

**Default Tool:** Grafana + VictoriaMetrics / Prometheus
**License:** AGPL-3.0 / Apache 2.0
**Why:** Grafana provides rich HTTP APIs for dashboards, annotations, and alerts plus OAuth2 auth, while VictoriaMetrics is a single-binary, low-RAM Prometheus-compatible backend.
**Example Tools:** DataDog, New Relic, Grafana

**Category Semantics:**

- **Routing (`Destination`):** Only `environment` (in `markDeployment` and `muteAlerts`) acts as a routing destination (`FillNone`), matching its role in `cd` so per-principal overrides can direct telemetry calls to environment-specific observability backends.
- **Naming Convention:** `createAlertRule` was renamed from `createAlert` to clarify that the intent provisions a rule definition (`conditions`, `actions`) rather than firing an active alert.
- **Target Objects & Queries:** All other slots identify existing telemetry objects (`alertId`, `serviceId`, `traceId`, `sloId`) or query/payload parameters (`FillAny`).

| Intent (`Seat`)    | Parameters (`Args`)                                  | Destination   | Slot Fill Constraints                                        |
| ------------------ | ---------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| `createAnnotation` | `timestamp`, `message`, `tags`                       | —             | `timestamp`: `FillAny` `message`: `FillAny` `tags`: `FillAny` |
| `getMetrics`       | `query`, `timeRange`                                 | —             | `query`: `FillAny` `timeRange`: `FillAny`                    |
| `createAlertRule`  | `conditions`, `actions`                              | —             | `conditions`: `FillAny` `actions`: `FillAny`                 |
| `silenceAlert`     | `alertId`, `duration`                                | —             | `alertId`: `FillAny` `duration`: `FillAny`                   |
| `getServiceLogs`   | `serviceId`, `timeRange`, `filter`                   | —             | `serviceId`: `FillAny` `timeRange`: `FillAny` `filter`: `FillAny` |
| `getTraces`        | `traceId`                                            | —             | `traceId`: `FillAny`                                         |
| `markDeployment`   | `serviceId`, `environment`, `version`, `description` | `environment` | `serviceId`: `FillAny` `environment`: `FillNone` `version`: `FillAny` `description`: `FillAny` |
| `getSloStatus`     | `sloId`                                              | —             | `sloId`: `FillAny`                                           |
| `muteAlerts`       | `serviceId`, `environment`, `duration`, `reason`     | `environment` | `serviceId`: `FillAny` `environment`: `FillNone` `duration`: `FillAny` `reason`: `FillAny` |

## `scm`

**Default Tool:** Gitea or Forgejo
**License:** MIT
**Why:** Fast, single-container Git forge with a GitHub-compatible REST API, built-in OAuth2 provider (ideal for testing your token broker's OAuth handshake and refresh flows locally), and webhooks.
**Example Tools:** GitHub, GitLab, Gitea

**Category Semantics:**

- **No Routing (`Destination`):** None of the `scm` intents carry a `Destination`. Even though `repo` uses `FillNone` (supplied statically or via the principal's connection rather than event payloads), it identifies the target repository object being acted on rather than a routing selector across different tools.
- **Target Objects & People:** `prId` identifies an existing pull request (`FillAny`), and `reviewers` names people rather than a routing destination.

| Intent (`Seat`)            | Parameters (`Args`)                            | Destination | Slot Fill Constraints                                        |
| -------------------------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `createBranch`             | `repo`, `branchName`, `fromRef`                | —           | `repo`: `FillNone` `branchName`: `FillAny` `fromRef`: `FillAny` |
| `deleteBranch`             | `repo`, `branchName`                           | —           | `repo`: `FillNone` `branchName`: `FillAny`                   |
| `createPullRequest`        | `repo`, `source`, `target`, `data`             | —           | `repo`: `FillNone` `source`: `FillAny` `target`: `FillAny` `data`: `FillAny` |
| `mergePullRequest`         | `prId`                                         | —           | `prId`: `FillAny`                                            |
| `addPullRequestComment`    | `prId`, `comment`                              | —           | `prId`: `FillAny` `comment`: `FillAny`                       |
| `requestPullRequestReview` | `prId`, `reviewers`                            | —           | `prId`: `FillAny` `reviewers`: `FillAny`                     |
| `getPullRequestStatus`     | `prId`                                         | —           | `prId`: `FillAny`                                            |
| `tagRelease`               | `repo`, `tag`, `ref`                           | —           | `repo`: `FillNone` `tag`: `FillAny` `ref`: `FillAny`         |
| `approvePullRequest`       | `prId`, `comment`                              | —           | `prId`: `FillAny` `comment`: `FillAny`                       |
| `setCommitStatus`          | `repo`, `ref`, `state`, `context`, `data`      | —           | `repo`: `FillNone` `ref`: `FillAny` `state`: `FillAny` `context`: `FillAny` `data`: `FillAny` |
| `getFileContent`           | `repo`, `path`, `ref`                          | —           | `repo`: `FillNone` `path`: `FillAny` `ref`: `FillAny`        |
| `commitFile`               | `repo`, `branch`, `path`, `content`, `message` | —           | `repo`: `FillNone` `branch`: `FillAny` `path`: `FillAny` `content`: `FillAny` `message`: `FillAny` |

## `scorecards`

**Default Tool:** Backstage Soundcheck / Tech Insights or OpenSSF Scorecard
**License:** Apache 2.0
**Why:** Since your platform targets Backstage, `@backstage-community/plugin-tech-insights` runs directly inside Backstage for service scorecards, paired with OpenSSF Scorecard CLI/container for repo checks.
**Example Tools:** Soundcheck, Cortex, OpsLevel, Lighthouse, Compass

**Category Semantics:**

- **No Routing (`Destination`):** None of the intents carry a `Destination`. Unlike `cd` or `observability` (which route to a live runtime `environment`), scorecards evaluate catalog entities (`entityRef`) or source repositories (`repo`) against a single configured governance/quality catalog.
- **Target Objects & Constraints:** `entityRef` identifies a Backstage Software Catalog entity (`FillSpecific` (`["entityRef"]`)), `repo` identifies a source repository (`FillNone` — matching `scm` and `security` so it binds from static configuration or connection context rather than arbitrary event fields), and `scorecardId` / `checkId` / `campaignId` identify existing scorecard objects (`FillAny`).
- **Default Tools:** `@backstage-community/plugin-tech-insights` / Soundcheck (Apache 2.0) for catalog-level checks and scorecards, paired with OpenSSF Scorecard (Apache 2.0) for repository security posture scans; extensible to Cortex, OpsLevel, Compass, and Lighthouse.

| Intent (`Seat`)            | Parameters (`Args`)                                  | Destination | Slot Fill Constraints                                        |
| -------------------------- | ---------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `getEntityScorecard`       | `entityRef`, `scorecardId`                           | —           | `entityRef`: `FillSpecific` (`["entityRef"]`) `scorecardId`: `FillAny` |
| `listEntityScorecards`     | `entityRef`                                          | —           | `entityRef`: `FillSpecific` (`["entityRef"]`)                |
| `evaluateScorecard`        | `entityRef`, `scorecardId`                           | —           | `entityRef`: `FillSpecific` (`["entityRef"]`) `scorecardId`: `FillAny` |
| `runRepoScorecard`         | `repo`, `checks`                                     | —           | `repo`: `FillNone` `checks`: `FillAny`                       |
| `getCheckResult`           | `entityRef`, `checkId`                               | —           | `entityRef`: `FillSpecific` (`["entityRef"]`) `checkId`: `FillAny` |
| `recordCheckFact`          | `entityRef`, `factRetrieverId`, `facts`              | —           | `entityRef`: `FillSpecific` (`["entityRef"]`) `factRetrieverId`: `FillAny` `facts`: `FillAny` |
| `createScorecardException` | `entityRef`, `checkId`, `justification`, `expiresAt` | —           | `entityRef`: `FillSpecific` (`["entityRef"]`) `checkId`: `FillAny` `justification`: `FillAny` `expiresAt`: `FillAny` |
| `getLeaderboard`           | `scorecardId`, `filter`                              | —           | `scorecardId`: `FillAny` `filter`: `FillAny`                 |
| `getCampaignStatus`        | `campaignId`                                         | —           | `campaignId`: `FillAny`                                      |

## `security`

**Default Tool:** Trivy + Dependency-Track
**License:** Apache 2.0
**Why:** Trivy runs in client/server mode via Docker for container/IaC scanning, while OWASP Dependency-Track gives you a persistent REST API for SBOMs, vulnerability findings, and policy triage.
**Example Tools:** Snyk, Trivy, SonarQube

**Category Semantics:**

- **No Routing (`Destination`):** All slots identify target objects (`artifactId`, `repo`, `scanId`, `findingId`, `serviceId`, `buildId`) or payload data (`justification`, `attestation`).
- **Mixed Fill Strictness:** Build and artifact references enforce `FillSpecific`, `repo` enforces `FillNone`, and scan/finding/service IDs allow `FillAny`.

| Intent (`Seat`)           | Parameters (`Args`)          | Destination | Slot Fill Constraints                                        |
| ------------------------- | ---------------------------- | ----------- | ------------------------------------------------------------ |
| `scanArtifact`            | `artifactId`                 | —           | `artifactId`: `FillSpecific` (`["artifactId"]`)              |
| `scanRepository`          | `repo`                       | —           | `repo`: `FillNone`                                           |
| `getScanResults`          | `scanId`                     | —           | `scanId`: `FillAny`                                          |
| `createSecurityException` | `findingId`, `justification` | —           | `findingId`: `FillAny` `justification`: `FillAny`            |
| `getComplianceStatus`     | `serviceId`                  | —           | `serviceId`: `FillAny`                                       |
| `attestBuild`             | `buildId`, `attestation`     | —           | `buildId`: `FillSpecific` (`["buildId"]`) `attestation`: `FillAny` |
| `verifyAttestation`       | `artifactId`                 | —           | `artifactId`: `FillSpecific` (`["artifactId"]`)              |

## `testing`

**Default Tool: ** Allure Docker Service or Kiwi TCMS
**License:** Apache 2.0 / GPL-2.0
**Why:** Allure Docker Service provides a lightweight REST API for uploading and querying test execution results (Playwright, Jest, JUnit) without needing a heavy database.
**Example Tools:** TestRail, CodeCov, Playwright

**Category Semantics:**

- **No Routing (`Destination`):** All slots identify test/build objects (`suiteId`, `runId`, `buildId`) or payload parameters (`params`, `format`).
- **Strict Build Binding:** `getCodeCoverage` enforces `FillSpecific` (`["buildId"]`) to match `ci` and `security` build references, while `suiteId` and `runId` use `FillAny`.

| Intent (`Seat`)      | Parameters (`Args`) | Destination | Slot Fill Constraints                     |
| -------------------- | ------------------- | ----------- | ----------------------------------------- |
| `triggerTestSuite`   | `suiteId`, `params` | —           | `suiteId`: `FillAny` `params`: `FillAny`  |
| `getTestResults`     | `runId`             | —           | `runId`: `FillAny`                        |
| `createTestReport`   | `runId`, `format`   | —           | `runId`: `FillAny` `format`: `FillAny`    |
| `getCodeCoverage`    | `buildId`           | —           | `buildId`: `FillSpecific` (`["buildId"]`) |
| `compareTestResults` | `runId1`, `runId2`  | —           | `runId1`: `FillAny` `runId2`: `FillAny`   |

## `ticketing`

**Default Tool: ** Plane or Vikunja
**License:** AGPL-3.0
**Why:** Plane is an open-source Jira/Linear alternative with workspaces, issues, cycles, webhooks, and API tokens. (Alternatively, Gitea Issues can double as your ticketing target to save RAM).
**Example Tools:** Jira, Linear, GitHub Issues, Asana

**Category Semantics:**

- **Routing (`Destination`):** Only `project` acts as a destination slot (used when opening or searching tickets, allowing per-principal tool overrides or default project injection).
- **Target Objects:** `ticketId` and `artifactId` identify existing objects rather than routing destinations. `userId` identifies a target assignee.

| Intent (`Seat`)        | Parameters (`Args`)                     | Destination | Slot Fill Constraints                                        |
| ---------------------- | --------------------------------------- | ----------- | ------------------------------------------------------------ |
| `createProjectTicket`  | `project`, `data`                       | `project`   | `project`: `FillNone` (static/defaulted, no event binding) `data`: `FillAny` |
| `updateProjectTicket`  | `ticketId`, `data`                      | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `data`: `FillAny` |
| `closeProjectTicket`   | `ticketId`, `resolution`                | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `resolution`: `FillAny` |
| `linkTicketToArtifact` | `ticketId`, `artifactId`                | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `artifactId`: `FillSpecific` (`["artifactId"]`) |
| `getTicketStatus`      | `ticketId`                              | —           | `ticketId`: `FillSpecific` (`["ticketId"]`)                  |
| `assignTicket`         | `ticketId`, `userId`                    | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `userId`: `FillAny` |
| `transitionTicket`     | `ticketId`, `state`                     | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `state`: `FillAny` |
| `commentOnTicket`      | `ticketId`, `comment`                   | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `comment`: `FillAny` |
| `addTicketLabel`       | `ticketId`, `label`                     | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `label`: `FillAny` |
| `linkTickets`          | `ticketId`, `otherTicketId`, `relation` | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `otherTicketId`: `FillAny` `relation`: `FillAny` |
| `attachEvidence`       | `ticketId`, `evidence`                  | —           | `ticketId`: `FillSpecific` (`["ticketId"]`) `evidence`: `FillAny` |
| `findTickets`          | `project`, `filter`                     | `project`   | `project`: `FillNone` (static/defaulted, no event binding) `filter`: `FillAny` |
