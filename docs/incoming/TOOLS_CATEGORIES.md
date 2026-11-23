# Tool Categories and Seats / Intents

## Mapping Koine to Crew Suite

| Koine          | Crew Suite          | Example Tools                                                |
| -------------- | ------------------- | ------------------------------------------------------------ |
| approval       |                     | Harness CD Approval Gates                                    |
| artifact       |                     | Artifactory, Harbor                                          |
| booking        |                     | Exchange room mailboxes, Google Workspace calendar resources, Robin, Envoy |
| cd             |                     | ArgoCD, Flux, Spinnaker                                      |
| ci             |                     | GitHub Actions, Jenkins, CircleCI, Buildkite                 |
| communication  | communication       | Zulip, Mattermost, Slack                                     |
| documentation  |                     | Confluence, Quip, Notion                                     |
| email          |                     | Amazon SES, Microsoft 365, Google Workspaces                 |
| featureflags   |                     | Flagsmith, OpenFeature                                       |
|                | finops              | CloudCost, Kubecost                                          |
| incidents      | incident-management | PagerDuty, OpsGenie                                          |
| infrastructure |                     | Terraform, Pulumi, Crossplane, Humanitec, Vault              |
| observability  | observability       | DataDog, New Relic, Grafana                                  |
|                | quality-scorecards  | Soundcheck, Cortex, OpsLevel, Lighthouse, Compass            |
| scm            | vcs                 | GitHub, GitLab, Gitea                                        |
| security       |                     | Snyk, Trivy, SonarQube                                       |
| testing        |                     | TestRail, CodeCov, Playwright                                |
| ticketing      |                     | Jira, Linear, GitHub Issues, Asana                           |

### Default Open-Source Containers by Tool Category

| Koine / Crew Suite | Recommended OSS Default | License | Why it fits Docker Compose & Token Broker testing |
| --- | --- | --- | --- |
| **approval** | **Temporal** (Native Signals/Updates)** or **Gotify** | MIT | For human-in-the-loop gates, Temporal’s native workflow signals/updates handle approvals without external state. If you need an external REST target, **Gotify** or **n8n** provides a lightweight webhook/approval endpoint. |
| **artifact** | **Harbor** or **Zot** | Apache 2.0 | **Zot** is a single, tiny Go binary/container implementing the OCI Distribution spec with Bearer/OAuth2 auth. Use **Harbor** if you also need Helm charts, vulnerability scanning webhooks, and RBAC UI. |
| **booking** | **Cal.com** or **Radicale** | AGPL-3.0 / GPL-3.0 | **Cal.com** exposes a modern REST API and OAuth2 flows for room/resource scheduling. **Radicale** is an ultra-lightweight CalDAV server if you want zero-overhead calendar/resource testing. |
| **cd** | **Argo CD** | Apache 2.0 | Industry standard for Kubernetes CD, ships with a clean REST/gRPC API, native OIDC/OAuth2 token support, and runs well in a single-node Kind/K3d or Compose setup. |
| **ci** | **Woodpecker CI** or **Drone CI** | Apache 2.0 | Lightweight, container-native CI with a clean REST API and native OAuth2 integration with Gitea. (Alternatively, **Gitea Actions** reuses your Gitea container). |
| **communication** | **Mattermost** or **Zulip** | MIT / Apache 2.0 | **Mattermost** (Team Edition) runs in a single container + Postgres, acts as a drop-in Slack API equivalent, and natively supports OAuth2 apps and personal access tokens. |
| **documentation** | **Outline** or **Wiki.js** | BSL / AGPL-3.0 | **Outline** provides a Notion-like REST/RPC API and native OAuth2 provider support (great for testing user-delegated token scopes). **Wiki.js** offers a clean GraphQL API with MIT/AGPL licensing. |
| **email** | **Mailpit** | MIT | Single-binary SMTP + REST API server built specifically for local Docker testing—captures outbound emails and lets your test suite query/assert sent messages via HTTP API. |
| **featureflags** | **Flagsmith** or **Flipt** | BSD-3 / GPL-3.0 | **Flipt** is a single, fast Go container with native OpenFeature SDK support and clean REST/gRPC management APIs. **Flagsmith** is great if you want a full admin UI alongside OpenFeature. |
| **finops** | **OpenCost** | Apache 2.0 | CNCF incubating standard (the open-source core behind Kubecost) with a lightweight container and clean REST API for querying cluster/namespace cost allocations. |
| **incidents** | **GoAlert** or **Grafana OnCall** | Apache 2.0 / AGPL-3.0 | **GoAlert** (built by Target) is an open-source PagerDuty alternative with on-call schedules, escalation policies, and GraphQL/REST APIs in a lightweight Go container. |
| **infrastructure** | **OpenTofu** (via **Atlantis**) or **OpenBao** | MPL-2.0 / Apache 2.0  | **Atlantis** gives you a stateful GitOps REST/webhook runner for OpenTofu/Terraform plans and applies. Pair with **OpenBao** (Linux Foundation fork of Vault) for secrets/KMS simulation. |
| **observability** | **Grafana)** + **VictoriaMetrics** / **Prometheus** | AGPL-3.0 / Apache 2.0 | **Grafana** provides rich HTTP APIs for dashboards, annotations, and alerts plus OAuth2 auth, while **VictoriaMetrics** is a single-binary, low-RAM Prometheus-compatible backend. |
| **quality-scorecards** | **Backstage Soundcheck / Tech Insights** or **OpenSSF Scorecard** | Apache 2.0 | Since your platform targets Backstage, `@backstage-community/plugin-tech-insights` runs directly inside Backstage for service scorecards, paired with **OpenSSF Scorecard** CLI/container for repo checks. |
| **scm / vcs** | **Gitea** or **Forgejo** | MIT                   | Fast, single-container Git forge with a GitHub-compatible REST API, built-in OAuth2 provider (ideal for testing your token broker's OAuth handshake and refresh flows locally), and webhooks. |
| **security** | **Trivy** + **Dependency-Track** | Apache 2.0 | **Trivy** runs in client/server mode via Docker for container/IaC scanning, while **OWASP Dependency-Track** gives you a persistent REST API for SBOMs, vulnerability findings, and policy triage. |
| **testing** | ***\*Allure Docker Service\**** or **Kiwi TCMS** | Apache 2.0 / GPL-2.0  | **Allure Docker Service** provides a lightweight REST API for uploading and querying test execution results (Playwright, Jest, JUnit) without needing a heavy database. |
| **ticketing** | **Plane)** or **Vikunja** | AGPL-3.0 | **Plane** is an open-source Jira/Linear alternative with workspaces, issues, cycles, webhooks, and API tokens. (Alternatively, **Gitea Issues** can double as your ticketing target to save RAM). |

### Key Architectural Tips for Local Docker Compose

1. **Reuse Gitea as your local OAuth2 Identity & Provider mock:** Gitea acts as a full RFC-compliant OAuth2 authorization server out of the box (supporting authorization code, PKCE, and rotating refresh tokens). You can test your broker's entire OAuth consent, callback binding, and token refresh concurrency against Gitea before touching external SaaS sandboxes.
2. **Watch memory footprints in Compose:** Running 15+ containers locally can easily exhaust developer laptop RAM. Favor single-binary Go services (**Gitea, Zot, Flipt, OpenCost, GoAlert, Mailpit, VictoriaMetrics, OpenBao**) over JVM-based stacks (**SonarQube, Keycloak, Jenkins**) where possible—that entire Go stack consumes under ~1.5 GB of RAM combined.
3. **Separate "User-Delegated OAuth" vs. "Service/API Token" adapters:** Notice that tools like **Mailpit**, **Trivy**, and **OpenCost** use service-level credentials or unauthenticated internal endpoints rather than per-user OAuth2 grants. Make sure your provider adapter matrix explicitly distinguishes **User OAuth2 / OBO providers** (Gitea, Mattermost, Outline, Cal.com, Argo CD) from **Service-Scoped / Policy-Gated providers** (OpenCost, Trivy, Mailpit) as noted in Section A and Alternative #3 of your Scope of Work.

## Approval

This `approval` group maps to **workflow approval gates, change-management engines, and Human-in-the-Loop (HITL) orchestration platforms**—systems that track formal authorization records (`requestId`), enforce multi-step approval workflows (`workflowId`), record audit trails of who approved or rejected and why (`approverId`, `comment`, `reason`), and support reassignment, escalation, and formal closure.

### Enterprise Workflow & Change Management Gates

- [ServiceNow Change Management](https://www.servicenow.com/products/change-management.html) **/ Approval Engine.** A textbook match for this exact schema: tracks formal `sys_approval` records (`requestId`), ties them to change workflows (`workflowId`), records approver comments/rejection reasons, and natively supports delegation/reassignment (`reassignApprovalRequest`), escalation rules (`escalateApprovalRequest`), and closure states.
- [Jira Service Management](https://www.atlassian.com/software/jira/service-management) **(Change Approvals).** Provides dedicated approval gates on change requests with formal approve/decline actions, approver audit logs, comments, and escalation policies.
- [Salesforce Approval Processes](https://help.salesforce.com/s/articleView?language=en_US&id=platform.automate_automated_approvals.htm&type=5)**.** Models multi-step approval workflows (`workflowId`) with individual approval instances (`requestId`), approve/reject with comments, reassignment to alternate approvers, escalation paths, and recall/cancellation (`cancelApprovalRequest`).
- [Microsoft Power Automate Approvals](https://learn.microsoft.com/en-us/power-automate/modern-approvals)**.** Built as a dedicated approval state machine (`requestApproval`) that persists `requestId` records, captures approver IDs and comments/reasons, supports reassignment (`reassignApprovalRequest`), and cancels pending requests.

### Developer & DevOps Release Approval Gates

- [GitHub Actions](https://github.com/actions) **Deployment Protection Rules / Environments.** Acts as an execution gate (`requestApproval`) that pauses a workflow run until authorized reviewers approve or reject with a comment, recording the full audit trail.
- Harness CD **Approval Gates /** [Azure Pipelines](https://azure.microsoft.com/en-us/products/devops/pipelines) **Manual Validation.** Formal pipeline pause gates that block execution until a designated approver signs off or rejects with justification, supporting timeout escalations and cancellation.
- [Opal Security](https://www.opal.dev/platform) **/** ConductorOne **/** [Veza](https://veza.com/) **(Access & Privilege Approval Gates).** Specialized identity/access approval engines where requests (`requestId`) are routed through approval workflows, escalated across levels, reassigned, approved/rejected with reasons, and closed upon fulfillment.

#### Human-in-the-Loop (HITL) & AI Agent Orchestration Engines

- [Temporal](https://temporal.io/how-it-works) **/** Restate **/** [Camunda](https://camunda.com/) **(BPMN).** Workflow orchestration engines commonly used as the backing state machine for approval gates—persisting long-lived `requestId` workflows that wait on external `approveRequest`/`rejectRequest` signals, handle timer-based escalations, and record final outcomes.
- [HumanLayer](https://humanlayer.vercel.app/) **/** [Permit.io](http://permit.io/) **/ Port (Internal Developer Portal Actions).** Modern developer and AI-agent approval gates designed specifically to decouple the **approval state machine** (`approval` category) from the **notification channel** (`communication.sendApprovalRequest`), matching the exact architectural split described in your code comments.

## Artifact Platforms

This `artifact` group maps to **package registries, container registries, and universal artifact repositories**—especially enterprise software supply-chain tools that handle promotion pipelines, cryptographic signing, SBOM/attestation evidence, and vulnerability scanning.

### Universal Enterprise Artifact Repositories

- **JFrog Artifactory (with JFrog Xray).** The quintessential match for every Seat here. It explicitly organizes storage into repositories (`dev` → `staging` → `prod`), features first-class artifact promotion (`promoteArtifact`), attaches custom metadata/properties and signed evidence/attestations (`attachArtifactEvidence`), and pairs with Xray for `getArtifactVulnerabilities`.
- **Sonatype Nexus Repository.** Supports multi-format repositories (Maven, npm, Docker, PyPI, NuGet), repository-to-repository promotion/staging, tagging, and vulnerability scanning via Nexus IQ.

- **Cloudsmith.** A cloud-native universal artifact management platform supporting repository promotion, GPG/Cosign signature verification, vulnerability scanning, and metadata/tagging.

- **Azure Artifacts.** Manages universal packages, feeds (repositories), package promotion across views (`@Local`, `@Prerelease`, `@Release`), and retention/pinning (`pinArtifact`).

### Cloud-Native Container & OCI Registries

- **AWS Elastic Container Registry (ECR) & AWS CodeArtifact.** Supports image tagging, lifecycle pinning/retention rules, built-in vulnerability scanning (Amazon Inspector), and cryptographic signing via AWS Signer / Notation.
- **Google Cloud Artifact Registry.** Stores container images and language packages across repositories, integrates with Binary Authorization for `signArtifact` / `verifyArtifactSignature`, and includes Artifact Analysis for vulnerability scanning and attestation evidence.
- **Azure Container Registry (ACR).** Supports OCI artifacts, tagging, locking/pinning images (`pinArtifact`), Notary/Notation signatures, and Microsoft Defender vulnerability scanning.
- **GitHub Container Registry (GHCR) & GitHub Packages.** Uses OCI referrers to attach SBOMs and provenance attestations (`attachArtifactEvidence`), supports Sigstore/Cosign signatures, and integrates with Dependabot/CodeQL security advisories.

### Open-Source & Self-Hosted Registries

- **Harbor.** An open-source cloud-native registry that directly implements repository replication/promotion, Cosign/Notary signing, Trivy vulnerability scanning (`getArtifactVulnerabilities`), and retention/immutability rules (`pinArtifact`).
- **Quay (Red Hat Quay).** Supports container and OCI artifact storage, tag immutability/expiration, Clair vulnerability scanning, and Cosign signature verification.

## Booking

In addition to the platforms already noted in your code comments (**Exchange room mailboxes, Google Workspace calendar resources, Robin, Envoy, Condeco, Skedda, and ServiceNow Workplace**), this `booking` category aligns closely with **Integrated Workplace Management Systems (IWMS)**, **hybrid office / desk-booking tools**, and **campus/facility scheduling software**.

Notice how Seats like `findAvailable` (filtering by `kind`, `capacity`, and `location`), `checkIn`, `releaseResource` (early checkout when a meeting ends early), and `requestService` (ordering catering, AV setup, or room reconfiguration) reflect enterprise office and campus management.

### Enterprise Workplace & Space Management (IWMS)

- **Appspace.** A major workplace experience platform handling room and desk reservations, interactive floor maps by building/zone (`location`), check-in kiosks, automatic room release on no-show, and catering/AV service requests.
- **FM:Systems (FMS:Workplace) & Archibus (Eptura).** Enterprise IWMS platforms built around buildings, campuses, and zones, featuring space capacity search, check-in workflows, and facilities/catering work-order requests (`requestService`).
- **Smartway2 (HubStar).** Focuses on meeting room and desk booking with occupancy sensors, automatic check-in/release, visitor management, and integrated hospitality/catering requests.
- **Density / VergeSense (paired with workplace booking).** Often used alongside room schedulers to automate `checkIn` and `releaseResource` when sensors detect a room is empty.

### Hybrid Office & Desk/Room Scheduling

- **Joan (Visionect).** Known for e-ink room tablets outside conference rooms that directly support `findAvailable`, `bookResource`, on-device `checkIn`, and early `releaseResource`.
- **Teem (by iOffice / Eptura).** Provides room and desk scheduling by office location and capacity, check-in enforcement, and workplace service requests.
- **Kadence & Officely.** Hybrid work coordination platforms that filter desks, rooms, and parking spots by office zone and capacity, with check-in reminders and early release.
- **Deskbird.** European hybrid workplace platform supporting multi-location resource search (desks, meeting rooms, parking), capacity filtering, and check-ins.

### Higher Education, Venue & Event Scheduling

- **25Live (CollegeNET) & EMS (Accruent).** The standard for university campuses and large conference centers; heavily relies on `location` (campus/building), room `capacity`, `kind` (classroom, lab, auditorium), and `requestService` for AV/setup/catering orders.
- **LibCal (Springshare).** Widely used by libraries and universities to search rooms/equipment by capacity and zone, enforce check-ins, and release unclaimed bookings.

## Communication

This `communication` group maps directly to **team messaging and enterprise collaboration chat platforms**—specifically tools built around persistent channels, direct messages, threaded replies, message editing, emoji reactions, channel topics, and interactive approval cards (`sendApprovalRequest`).

### Enterprise Team Messaging & Chat Platforms

- **Slack.** The quintessential blueprint for every single Seat here: posting to channels (`chat.postMessage`), direct messages (`notifyUser`), threaded replies (`thread_ts` → `replyInThread`), updating live status messages (`chat.update`), emoji reactions (`reactions.add`), interactive Block Kit approval prompts (`sendApprovalRequest`), and full channel lifecycle management (`conversations.create`, `invite`, `setTopic`, `archive`).
- **Microsoft Teams.** Supports channel messages, 1:1 user chats, threaded channel replies, adaptive card approval requests (`sendApprovalRequest`), message updates, emoji reactions, and creating, inviting members to, updating descriptions/topics for, and archiving channels.
- **Google Chat.** Provides spaces (channels), direct messages, threaded messages, interactive card dialogs for approvals, message editing, emoji reactions, and space/membership management APIs.
- **Webex (Cisco Webex Messaging).** Models spaces (`channel`), direct person messages (`userId`), threaded replies, message edits, Adaptive Cards for human approvals, and space creation/archiving.
- **Zoom Team Chat.** Supports channels, direct messages, threads, message edits, emoji reactions, and channel creation/member management.

### Open-Source & Self-Hosted Team Chat Platforms

- **Mattermost.** Designed as an open-source Slack alternative with one-to-one API parity: channels, DMs, threads, post updates, emoji reactions, interactive message buttons for approvals, channel topics/headers, and channel archiving.
- [Rocket.Chat](http://rocket.chat/)**.** Supports public/private channels, direct messages, threaded discussions, message editing, reactions, interactive action buttons, channel topics, and archiving.
- **Zulip.** Built heavily around streams (`channel`) and topics (`setChannelTopic` / `threadRef`), with direct messages, message edits, emoji reactions, and stream archiving.

### Community & Developer Chat Platforms

- **Discord.** Maps cleanly to text channels, DMs, threads (`replyInThread`), message edits (`updateMessage`), reactions (`reactToMessage`), interactive button/modal approvals, channel topics, and channel creation/permission management.

## Continuous Deployment

This `cd` (Continuous Delivery / Deployment) group maps directly to **GitOps controllers, progressive delivery orchestrators, and enterprise CD platforms**—tools that deploy a specific `version` of a `serviceId` to a named target `environment`, monitor rollout health, sync desired state, and pause, resume, cancel, or roll back active deployments.

### GitOps & Kubernetes Progressive Delivery Tools

- **Argo CD (with Argo Rollouts).** A textbook match for this exact vocabulary. Argo CD directly uses the term **Sync** (`syncService`) to reconcile a service in an environment, reports application health (`getServiceHealth`) and live revision (`getDeployedVersion`), and pairs with Argo Rollouts for progressive deployments that can be paused (`pauseDeployment`), resumed (`resumeDeployment`), aborted (`cancelDeployment`), or rolled back (`rollbackService`).
- **Flux CD (with Flagger).** Continuously reconciles/syncs Kubernetes manifests per environment, tracks deployed versions and health checks, and uses Flagger to pause, resume, or roll back canary/blue-green rollouts.

### Enterprise Continuous Delivery & Release Orchestration Platforms

- **Harness CD.** Built around services, target environments (`dev`, `staging`, `prod`), deployment executions (`deploymentId`), progressive canary/blue-green steps that can be paused/resumed/aborted, and automated one-click rollbacks.
- **Spinnaker.** Classic multi-cloud CD platform designed around applications/services, environments, deployment pipelines (`getDeploymentStatus`, `cancelDeployment`, `pauseDeployment`), and versioned server-group rollbacks.
- **Octopus Deploy.** Specializes in deploying versioned releases of services across environments, checking deployment task status, canceling running deployments, and rolling back to a `targetVersion`.

### Cloud-Native Deployment Services

- **AWS CodeDeploy / Amazon ECS Deployments.** Tracks deployment IDs (`deploymentId`), supports stopping/canceling (`cancelDeployment`) or rolling back failed deployments, and monitors service health per environment.
- **Google Cloud Deploy.** Manages release promotions across target environments (`environment`), tracks rollout status, and supports explicit rollbacks (`rollbackService`) to a prior release version.
- **Azure Pipelines Environments / Azure Container Apps.** Deploys versioned service revisions to named environments, tracks deployment health, and rolls back traffic to previous revisions.

## Continuous Integration

This `ci` (Continuous Integration) group maps directly to **hosted CI/CD pipeline runners and build automation servers**—tools where a parameterized workflow (`pipelineId`) kicks off an individual build execution (`buildId`), produces downloadable outputs (`getBuildArtifacts`), exposes step-by-step console output (`getBuildLogs`), and supports promotion workflows (`promoteBuild`) into target environments.

### Cloud-Native & Git-Integrated CI Platforms

- [GitHub Actions](https://github.com/actions)**.** Maps cleanly across all Seats: triggering workflows with `workflow_dispatch` inputs (`triggerBuild`), canceling or re-running runs (`cancelBuild`, `retryBuild`), querying run status and step logs (`getBuildStatus`, `getBuildLogs`), downloading workflow artifacts (`getBuildArtifacts`), and environment protection/promotion gates (`promoteBuild`).
- **GitLab CI/CD.** Organizes builds into pipelines and jobs (`pipelineId` / `buildId`), supports manual/parameterized pipeline triggers, job retries, artifact downloads, trace logs per job/step, and manual environment promotion jobs (`promoteBuild`).
- **CircleCI.** Features parameterized pipeline triggers (`triggerBuild`), build status/cancellation/reruns, artifact storage, step-level logs, and approval-based promotion workflows.
- **Buildkite.** Built around pipelines and builds (`pipelineId`, `buildId`), with step-level logs (`getBuildLogs`), build artifacts, rebuild/cancel APIs, and block/promotion steps.
- **Travis CI / Bitbucket Pipelines.** Both provide parameterized build triggers, build status checks, step logs, artifact outputs, and environment deployment/promotion steps.

### Dedicated Enterprise & Self-Hosted Build Servers

- [Jenkins](https://www.jenkins.io/)**.** The classic match for parameterized job triggers (`triggerBuild` with `params`), build numbers (`buildId`), console output logs, archived build artifacts, build rebuilds, and Promoted Builds plugins (`promoteBuild`).
- [TeamCity](https://teamcity.volumental.com/) **(JetBrains).** Explicitly models build configurations (`pipelineId`), individual builds (`buildId`), build artifacts, step logs, and **build chain promotions** (`promoteBuild`) across environments.
- **Azure Pipelines.** Supports YAML pipeline runs with runtime parameters, run status/cancel/rerun APIs, pipeline artifacts, task-level logs (`step`), and environment approvals/promotions.
- **Drone CI / Woodpecker CI / Concourse CI.** Container-native CI engines that explicitly feature build promotion (`drone build promote` → `promoteBuild`), parameterized pipeline triggers, step logs, and build status/restart controls.

## Documentation

In addition to **Confluence**, **Quip**, and **Notion** (noted in your code comments), this `documentation` category maps to **collaborative wikis, structured document editors, and engineering knowledge bases**.

Notice the distinctive capabilities in this Seat list: Markdown translation, template instantiation (`createDocumentFromTemplate`), heading/section-targeted edits (`replaceDocumentSection`), file attachments (`attachToDocument`), inline comments (`addDocumentComment`), and key-based row upserts inside embedded tables (`setTableRow`—a hallmark of Notion databases, Confluence tables, and Coda/Quip live tables).

### Structured Docs & All-in-One Workspaces

- **Coda.** One of the closest matches to every Seat here—especially `setTableRow` (Coda treats tables inside documents as first-class relational databases with key-based row updates), templates, section/page appending, comments, and Markdown ingestion.
- **Google Docs (via Google Docs API).** Supports folder-scoped creation (`location`), template copying with placeholder replacement (`createDocumentFromTemplate`), structural section/tab edits, table row modifications, and document comments.
- **Microsoft Loop / SharePoint Pages.** Organizes pages inside workspaces/folders (`location`), supports page templates, embedded tables/components, file attachments, and page comments.
- **Dropbox Paper.** Built directly around Markdown-friendly collaborative documents, templates, folder destinations, tables, attachments, and inline comments.

### Engineering Knowledge Bases & Team Wikis

- **Outline.** A fast, Markdown-native team knowledge base organized by collections (`location`), supporting nested parent pages, templates, full-text search (`findDocument`), attachments, and comments.
- **BookStack.** Organizes documentation into Shelves, Books, and Chapters (`location`), with native Markdown support, page templates, attachments, and comments.
- **Slite.** AI-powered team wiki with channels/collections (`location`), doc templates, Markdown import/editing, tables, and inline comments.
- **Nuclino.** Lightweight collaborative wiki organized by workspaces and clusters (`location`), supporting Markdown formatting, templates, embedded tables, file attachments, and comments.
- **Slab.** Engineering-focused knowledge base organized by Topics (`location`), featuring Markdown editing, templates, search, and document comments.

## Email

This `email` group maps to **enterprise email suites, transactional email APIs, and calendar/scheduling providers**—specifically tools capable of outbound mail delivery, RFC-5322 email threading (`In-Reply-To` / `References` headers for `replyInMailThread`), scheduled digest batching (`sendDigest`), and iCalendar (`.ics`) meeting invite lifecycle management (`sendCalendarInvite`, `cancelCalendarInvite`).

### Enterprise Groupware & Mail/Calendar Suites

- [Microsoft 365](https://www.microsoft.com/en-us/microsoft-365) **(Exchange Online / Microsoft Graph API).** The closest all-in-one match for both mail and calendar Seats: sends emails, replies within existing mail threads (`createReply` / `reply`), and sends or cancels calendar invitations (`events` API) natively from a single mailbox.
- [Google Workspace](https://workspace.google.com/) **(Gmail API + Google Calendar API).** Supports sending mail, threading via `threadId` (`replyInMailThread`), and creating/canceling calendar invites with attendee notifications.
- [Zoho Mail](https://www.zoho.com/mail/) **&** [Zoho Calendar](https://www.zoho.com/calendar/features.html)**.** Enterprise email and calendar suite offering REST APIs for threaded email replies, scheduled digests, and calendar invite creation/cancellation.
- [Fastmail](https://www.fastmail.com/) **(JMAP API).** Modern standards-based mail and calendar provider supporting threaded mail replies and iCalendar scheduling via JMAP.

### Transactional Email & Notification Delivery APIs

*(For drivers that send `.ics` calendar attachments over SMTP/API rather than managing a full mailbox)*

- [Postmark](https://postmarkapp.com/developer/user-guide/send-email-with-api)**.** Built specifically for transactional email and automated digests, with strong support for custom `Message-ID` / `In-Reply-To` threading headers (`replyInMailThread`) and `.ics` calendar invite attachments.
- [SendGrid](https://www.twilio.com/en-us/sendgrid) **(Twilio SendGrid).** Handles transactional mail, batched summary digests, email thread headers, and `text/calendar` `.ics` invite/cancellation payloads.
- [Amazon SES](https://aws.amazon.com/ses/) **(Simple Email Service).** Low-level outbound email API commonly used in automation engines to send emails, threaded replies, digest summaries, and raw MIME `.ics` calendar invites/cancellations.
- [Mailgun](https://www.mailgun.com/) **/** [Resend](https://resend.com/docs/api-reference/emails/send-email)**.** Developer-focused email APIs supporting custom threading headers, digest sends, and `.ics` calendar invite attachments.

### Unified Email & Calendar API Aggregators

- **Nylas.** An abstraction API that sits directly over Gmail, Microsoft Exchange/365, and IMAP/CalDAV—explicitly exposing unified endpoints for sending mail, replying in threads, and creating/canceling calendar invites.
- [Cronofy](https://www.cronofy.com/)**.** Calendar-focused integration API that pairs with outbound email systems to dispatch and cancel cross-platform calendar invitations (`startsAt`, `endsAt`).

## Feature Flags

This `featureflags` group maps directly to **feature flag management, progressive delivery, and experimentation platforms**—tools that toggle features on or off per target `environment` (`dev`, `staging`, `prod`), adjust gradual percentage rollouts (`setFeatureRollout`), and query current flag states (`getFeatureStatus`).

### Dedicated Enterprise Feature Flag Platforms

- [LaunchDarkly](https://app.launchdarkly.com/)**.** The quintessential match for every Seat here: organizes flags across environments (`enableFeature`, `disableFeature`), supports percentage-based progressive rollouts (`setFeatureRollout`), and exposes flag evaluation/status APIs (`getFeatureStatus`).
- [Split](https://www.harness.io/products/feature-management-experimentation/feature-management) **(Harness Feature Management & Experimentation).** Built around per-environment flag targeting, percentage traffic splits/rollouts, kill switches (`disableFeature`), and real-time flag status checks.
- [Statsig](https://www.statsig.com/)**.** Combines feature gates per environment with dynamic percentage rollouts, instant kill switches, and gate status inspection.
- [Flagsmith](https://app.flagsmith.com/)**.** Supports environment-scoped feature toggles, percentage split segments, and flag state queries via REST API.
- [ConfigCat](https://configcat.com/)**.** Provides environment-specific feature flag toggles, percentage targeting rules, and flag status APIs.

### Open-Source & Self-Hosted Feature Flag Engines

- [Unleash](https://www.getunleash.io/guide-to-feature-management)**.** A leading open-source feature management platform structured explicitly around environments, activation toggles, gradual rollout strategies (`flexibleRollout` percentage), and feature state queries.
- [GrowthBook](https://github.com/growthbook/growthbook)**.** Open-source feature flagging and A/B testing platform with per-environment toggle controls, percentage rollout rules, and SDK/API flag status inspection.
- [Flipt](https://flipt.io/) **/** [OpenFeature](https://openfeature.dev/docs/reference/intro/)**.** Cloud-native, GitOps-friendly open-source feature flag engines that evaluate boolean flags and percentage rollouts per environment.

### Cloud & All-in-One DevOps Feature Flag Modules

- [AWS AppConfig](https://aws.amazon.com/systems-manager/features/appconfig/) **Feature Flags.** Manages feature flag configurations deployed across target environments, supports gradual rollout strategies, and queries live flag configuration states.
- [Azure App Configuration](https://azure.microsoft.com/en-us/products/app-configuration) **(Feature Manager).** Stores environment-scoped feature flags with percentage filter rollouts and status APIs.
- [GitLab Feature Flags](https://docs.gitlab.com/operations/feature_flags/) **(powered by Unleash).** Built directly into GitLab projects to toggle features per deployment environment and set percentage rollouts.
- [PostHog](https://posthog.com/) **/** [Sentry](https://sentry.io/)**.** Developer suites that include native environment-scoped feature flags with percentage rollouts alongside product analytics or error monitoring.

## FinOps

While `observability` tracks technical metrics (CPU, latency, error rates) and `infrastructure` provisions resources, FinOps operates on **financial and unit-economics primitives** (`accountId`, `budgetId`, `costCenter`, `anomalyId`, `recommendationId`). Furthermore, teams frequently use specialized third-party FinOps platforms alongside native cloud billing tools—making a dedicated driver category especially valuable in your multi-driver architecture.

### Platforms That Fit a `finops` Category

- **Cloud-Native Billing & Cost Suites.** [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) & AWS Budgets, [Google Cloud Billing & Cost Management](https://cloud.google.com/cost-management), and [Microsoft Cost Management](https://azure.microsoft.com/en-us/products/cost-management) (Azure).
- **Dedicated Multi-Cloud FinOps Platforms.** [CloudHealth](https://aws.amazon.com/marketplace/pp/prodview-btyciyjmdewhm) (VMware/Broadcom), Apptio Cloudability, Vantage, Kubecost / OpenCost (for Kubernetes cost allocation), [Harness Cloud Cost Management](https://developer.harness.io/cloud-cost-management), and [Finout](https://www.finout.io/).
- **Automated Commitment & Rate Optimization Engines.** ProsperOps, Zesty, [Cast AI](https://cast.ai/), and [Spot by NetApp](https://www.netapp.com/company/executive-briefing-center/cloud-optimization/) (managing Reserved Instances, Savings Plans, and Spot/auto-scaling optimization).

### Core Intents (Seats) for a `finops` Category

Following the exact naming and slot conventions of your Go codebase (`account` or `costCenter` as a destination/scope, `FillSpecific` for object IDs, and `FillAny` for filters/payloads):

- **Spend Visibility & Forecasting.**
  - `getCloudSpend` (`scope`, `timeRange`, `groupBy`) — queries accrued or amortized costs broken down by service, team, tag, or environment.
  - `getCostForecast` (`scope`, `horizon`) — retrieves projected spend through the end of a billing period or quarter.
- **Budgets & Spend Alerts.**
  - `createBudget` (`scope`, `amount`, `period`, `thresholds`) — sets spending limits and alert thresholds for a team, project, or environment.
  - `getBudgetStatus` (`budgetId`) — checks current spend against a budget's allocated cap.
- **Cost Anomalies & Tag Governance.**
  - `getCostAnomalies` (`scope`, `timeRange`) — fetches unexpected spend spikes detected by the billing engine.
  - `acknowledgeCostAnomaly` (`anomalyId`, `note`) — marks a spend spike as reviewed or explained.
  - `getTagCompliance` (`scope`, `requiredTags`) — audits untagged or misallocated cloud resources.
- **Optimization & Savings Actions.**
  - `listSavingsRecommendations` (`scope`, `kind`) — retrieves rightsizing, idle-resource cleanup, or Reserved Instance / Savings Plan recommendations.
  - `applySavingsRecommendation` (`recommendationId`) — executes an automated rightsizing or commitment purchase (often paired with your `approval` category as a gate).

## Infrastructure

This `infrastructure` group maps to **Infrastructure-as-Code (IaC) orchestration engines, internal developer platforms (IDPs), and secrets managers**—specifically tools that spin up, modify, and tear down ephemeral or persistent environments (`spec` → `environmentId`) while managing sensitive credentials (`secretPath`).

### Infrastructure-as-Code (IaC) & Environment Orchestrators

- **HashiCorp Terraform / HCP Terraform (and OpenTofu):** Directly models provisioning (`terraform apply` from a `spec`), updating existing workspaces/environments (`updateInfrastructure`), checking state/status, and tearing down resources (`terraform destroy` via `environmentId`).
- **Pulumi (and Pulumi Cloud):** Creates and updates cloud stacks from code/specs, tracks stack status via stack/deployment IDs, and destroys environments on demand.
- **Crossplane:** Turns Kubernetes into a universal control plane that provisions, updates, and deletes cloud infrastructure environments from declarative specs.
- **AWS CloudFormation / Azure Resource Manager (Bicep) / Google Cloud Infrastructure Manager:** Cloud-native IaC engines that create, update, inspect, and delete stacks/deployments from template specs.

### Ephemeral Environment & Platform-as-a-Service (PaaS) Engines

- **Humanitec** **/** **Score:** Platform orchestrators built around workload specs (`spec`) that dynamically provision, update, and destroy full application environments and wire up secrets.
- **Qovery** **/** **Porter** **/** **Coherence:** Developer platforms that spin up, update, monitor, and tear down isolated preview or production environments from a configuration spec.
- **Env0** **/** **Spacelift** **/** **Scalr**: Dedicated IaC automation platforms that manage environment lifecycles (`provision`, `update`, `destroy`, `status`) and inject environment secrets.

### Secrets Management (for `getSecret` & `rotateSecret`)

Because `getSecret` and `rotateSecret` live inside this same category, a driver implementation might either pair an IaC tool with a secret store or use a cloud/platform suite that handles both:

- [HashiCorp Vault](https://www.hashicorp.com/en/products/vault). The industry standard for path-based secrets (`secretPath`) with built-in dynamic secret generation and automated rotation (`rotateSecret`).
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) [Google Cloud Secret Manager](https://cloud.google.com/security/products/secret-manager) [Azure Key Vault](https://azure.microsoft.com/en-us/products/key-vault). Cloud-native secret stores that fetch secrets by path/name and natively support automated or triggered credential rotation.
- [Doppler](https://www.doppler.com/blog/doppler-vs-traditional-secrets-managers) Infisica. Modern developer secret managers that organize credentials by project/environment paths and support secret syncing and rotation.

## Incidents Platforms

Along with **PagerDuty** and **Opsgenie** (which your code comments already call out), several other platforms implement this exact `incidents` model—where alerts are routed to a specific `service`, an on-call schedule (`getOnCall`, `pageOnCall`) is queried or triggered, and incidents move through an **acknowledge → escalate → resolve** lifecycle.

### Dedicated On-Call & Incident Response Platforms

- **Rootly.** Directly models technical services, severity levels, on-call schedules, escalation policies, timeline notes, and automated incident resolution.
- [Incident.io](http://incident.io/)**.** Built around service catalogs, on-call paging, severity classification, incident status tracking, and resolution summaries.
- **FireHydrant.** Uses a service-oriented architecture to page on-call responders, track incident milestones (acknowledged, resolved), add timeline notes, and escalate severity or responder levels.
- **VictorOps (Splunk On-Call).** Focuses heavily on routing keys/services, paging on-call engineers, acknowledging alerts, escalating to next-level responders, and resolving incidents.
- **xMatters.** Enterprise alerting and on-call management tool that maps cleanly to service destinations, escalation levels, acknowledgments, and incident notes.
- **Squadcast.** Provides service-based alert routing, on-call schedules, incident acknowledgment, escalation, and resolution workflows.

### Observability Suites with Native On-Call & Incident Modules

- **Datadog Incident Management & On-Call.** Combines service catalogs with built-in on-call paging, incident creation with severity levels, status tracking, and timeline notes.
- **Grafana Incident & Grafana OnCall.** Pairs alert routing by service with on-call rotations, escalation chains, and structured incident lifecycle tracking.
- **Better Stack (Better Uptime).** Integrates uptime monitoring with on-call schedules, escalation policies, incident acknowledgment, and resolution notes.

### Modern Open-Source / Developer-First Alternatives

- **PagerTree.** Straightforward on-call scheduling and alert routing tool with acknowledge, escalate, and resolve actions per service.
- **GoAlert.** Open-source on-call scheduling and automated escalation platform built around services and escalation policies.

## Observability

This `observability` group maps directly to **Application Performance Monitoring (APM), full-stack observability, and telemetry platforms**—tools that unify the "three pillars" of observability (**metrics, logs, and traces**) alongside deployment markers, SLO tracking, and alert rules.

### Full-Stack Commercial Observability & APM Platforms

- **Datadog.** Maps cleanly to every single Seat here: time-series metrics queries, Log Explorer (`getServiceLogs`), APM distributed traces (`getTraces`), Events/Deployment markers (`markDeployment` & `createAnnotation`), Monitors (`createAlertRule` & `muteAlerts`), and SLO burn-rate widgets (`getSloStatus`).
- **New Relic.** Features NRQL metrics/log querying, distributed tracing, deployment change tracking (`markDeployment`), alert conditions/muting rules, and Service Level Management (`getSloStatus`).
- **Dynatrace.** Provides unified metrics, logs, distributed traces (PurePath), deployment event ingestion, alerting profiles/maintenance windows, and native SLO tracking.
- **Honeycomb.** Built around wide events and distributed tracing (`getTraces`), with native deployment markers (`markDeployment`), trigger alerts (`createAlertRule`), and SLO burn alerts (`getSloStatus`).
- **Splunk Observability Cloud (SignalFx).** Combines real-time metrics, Log Observer, APM traces, detector alert rules, muting rules, and SLO monitoring.

### Open-Source & Cloud-Native Observability Stacks

- **Grafana Stack (Grafana + Prometheus/Mimir + Loki + Tempo).** A textbook match for this vocabulary: Grafana natively uses **Annotations** (`createAnnotation` and deployment markers), PromQL (`getMetrics`), LogQL (`getServiceLogs`), Tempo (`getTraces`), Grafana Alerting/Alertmanager (`createAlertRule`, `silenceAlert`, `muteAlerts`), and Grafana SLO (`getSloStatus`).
- **SigNoz.** An OpenTelemetry-native open-source APM that unifies metrics, logs, and traces in one backend with alert rules and deployment/event tracking.
- **Elastic Observability.** Pairs Elasticsearch/Kibana with APM traces, metrics, logs, alerting rules/snoozing (`silenceAlert`), annotations, and SLO management.

### Hyperscaler Cloud Observability Suites

- **AWS CloudWatch (with X-Ray).** Supports CloudWatch Metrics, CloudWatch Logs Insights, X-Ray traces, CloudWatch Alarms, and Application Signals SLOs.
- **Google Cloud Observability (Cloud Monitoring, Logging & Trace).** Includes metric querying, log explorer, distributed tracing, alerting policies/snoozes, and native Service Monitoring SLOs.
- **Azure Monitor (with Application Insights).** Combines Log Analytics/Metrics, end-to-end transaction traces, release annotations (`markDeployment`), alert rules/action groups, and suppression rules.

## Quality Scorecards

This maps directly to Soundcheck (Spotify's Backstage plugin), **Cortex**, **OpsLevel**, **Lighthouse**, and **Compass**—with intents like `evaluateScorecard`, `getServiceScore`, `listFailingChecks`, and `recordCheckResult`.

## Security (AppSec, Vulnerability Scanning & Supply Chain Attestation)

This group blends **Application Security Posture Management (ASPM) / vulnerability scanners** (`scanRepository`, `scanArtifact`, `createSecurityException`, `getComplianceStatus`) with **SLSA / Sigstore supply-chain attestation tools** (`attestBuild`, `verifyAttestation`).

- **Snyk.** Scans code repositories (`scanRepository`) and container/package artifacts (`scanArtifact`), returns structured scan findings (`getScanResults`), and supports ignoring/waiving vulnerabilities with a reason (`createSecurityException`).
- **Wiz / Prisma Cloud / Orca Security.** Cloud-native application protection platforms (CNAPP/ASPM) that scan repositories and container artifacts, track compliance posture per service (`getComplianceStatus`), and manage vulnerability exceptions/waivers.
- **Chainguard / Sigstore (Cosign) / Witness / in-toto.** Supply-chain security tools specifically built around generating SLSA build provenance (`attestBuild`) and cryptographically verifying artifact attestations (`verifyAttestation`).
- **Aqua Security (Trivy / Aqua Enterprise).** Combines container/repo vulnerability scanning with policy compliance checks and image/artifact attestation verification.
- **GitHub Advanced Security (GHAS) / GitLab Ultimate Security.** Native code/dependency/container scanning (`scanRepository`, `scanArtifact`) with dismissal reasons (`createSecurityException`) and GitHub Artifact Attestations (`attestBuild`, `verifyAttestation`).
- **SonarQube / Checkmarx / Veracode.** Dedicated SAST/SCA scanners that scan repositories, return scan results, and manage accepted-risk security exceptions (`createSecurityException`).

## Source Control Management

Along with **GitHub** (referenced directly in your code comment), these Seats fit **hosted Git forge and code-review platforms**—specifically tools that support branches, pull/merge requests, inline reviews, commit status checks (`setCommitStatus`), release tags, and REST/GraphQL file operations (`getFileContent`, `commitFile`).

- **GitLab.** Maps one-to-one with every Seat here (using Merge Requests in place of Pull Requests), including commit pipeline statuses, repository file APIs, and release tags.
- **Bitbucket (Cloud & Data Center).** Supports branch creation/deletion, pull requests with reviewer assignments and approvals, build commit statuses, and file read/write APIs.
- **Azure Repos (Azure DevOps).** Provides Git repository APIs for branches, pull requests, PR status checks, tags, and programmatic file commits.
- **Gitea / Forgejo.** Lightweight, self-hosted Git forges with GitHub-compatible APIs for branches, PRs, commit statuses, releases, and file contents.
- **AWS CodeCommit.** Supports repository branches, pull requests, approvals, comments, and direct file reads/commits via API.

## Testing

This `testing` group maps directly to **test management platforms, automated QA runners, and code coverage analytics tools**—systems that trigger parameterized test suites (`suiteId` → `runId`), fetch pass/fail execution results (`getTestResults`), export formatted reports (`createTestReport`), compare runs across versions (`compareTestResults`), and track build-level test coverage (`getCodeCoverage`).

### Test Management & QA Reporting Platforms

- [TestRail](https://alfasoft.com/software/development-tools/test-management/testrail/)**.** One of the closest matches for test suite and run management: triggers/creates test runs from a `suiteId`, fetches run outcomes (`getTestResults`), generates formatted exports (`createTestReport` in PDF, HTML, XML, or CSV), and compares test run results side-by-side (`compareTestResults`).
- [Qase](https://www.qase.io/product/) **/** [Zephyr Scale](https://finenscale.com/zephyr.html) **(SmartBear) /** [Xray](https://marketplace.atlassian.com/apps/1211769/xray-test-management-for-jira) **(for Jira).** Full-featured QA test management platforms that organize test suites, execute automated/manual test runs (`runId`), compare historical runs, and export structured compliance/QA reports.
- [Allure TestOps](https://sandbox.testops.cloud/)**.** Designed specifically for automated CI test runs—supports launching test suites with parameters, aggregating run results, comparing flaky/regressed tests across two runs (`compareTestResults`), and generating rich reports.
- [ReportPortal](https://www.reportportal.com/)**.** An AI-powered test automation dashboard that collects execution runs (`runId`), compares regressions between runs (`runId1` vs. `runId2`), and exports formatted test reports.

### Cloud Browser, Mobile & End-to-End (E2E) Test Runners

- [BrowserStack](https://live.browserstack.com/) **(Test Observability & Automate) /** [Sauce Labs](https://saucelabs.com/)**.** Executes parameterized cross-browser and mobile test suites (`triggerTestSuite`), exposes detailed run results and logs (`getTestResults`), compares run-over-run regressions, and generates downloadable reports.
- [LambdaTest](https://www.discovercloud.com/products/lambdatest) **/** [Rainforest QA](https://www.rainforestqa.com/) **/** [Checkly](https://www.checklyhq.com/)**.** Cloud E2E and synthetic test execution platforms that trigger test suites on demand via API, return run status/results, and generate formatted execution reports.
- [Playwright](https://playwright.dev/) **/** [Cypress Cloud](https://www.cypress.io/cloud)**.** Captures test run recordings (`runId`), compares test failures and flakiness across two runs (`compareTestResults`), and exports run analytics.

### Code Coverage & Quality Gate Tools (for `getCodeCoverage`)

Because `getCodeCoverage` takes a `buildId` (`FillSpecific`), drivers either pair a test runner with a coverage tool or use an all-in-one code quality suite:

- [Codecov](https://codecov.com/)**.** Built specifically to ingest coverage reports per `buildId` / commit, report line and branch coverage metrics, and compare coverage changes across builds.
- Coveralls**.** Tracks build-by-build code coverage (`getCodeCoverage`) and exposes REST APIs to query coverage percentages for any `buildId`.
- [SonarQube](https://www.sonarsource.com/products/sonarqube/) **/** [SonarCloud](https://getsonarcloud.com/)**.** Combines automated test execution metrics with build-level code coverage (`getCodeCoverage`) and quality reports.

## Ticketing Platforms

In addition to [Jira](https://www.atlassian.com/software/jira.5), [Linear](https://linear.app/), [GitHub Issues](https://docs.github.com/articles/about-issues), and [Asana](https://asana.com/), several other platforms fit the exact `ticketing` Seats defined in your codebase (project-scoped tickets, workflow state transitions, resolutions, labels, and ticket-to-ticket links):

### Merging Project Management into Ticketing Category

To match the exact style and conventions of your Go codebase (`project` as the routing `Destination`, `FillSpecific` for object IDs, and `FillAny` for payloads), an expanded `project-management` category would include these intents:

#### 1. Boards, Lists & Card Ordering (Kanban)

- **`createBoard` / `archiveBoard` (`project`, `name`, `template`).** Creates or retires a project board inside a workspace.
- **`createColumn` / `setColumnWipLimit` (`boardId`, `name`, `limit`).** Adds workflow stages or enforces Work-In-Progress limits.
- **`moveCard` (`cardId`, `columnId`, `position`).** Moves a card across columns or re-ranks its priority within a list.

#### 2. Sprints & Iterative Cycles (Agile)

- **`createSprint` (`boardId`, `name`, `startsAt`, `endsAt`).** Defines a time-boxed iteration or cycle.
- **`startSprint` / `closeSprint` (`sprintId`, `rolloverTarget`).** Opens an active sprint or closes it and moves unfinished work.
- **`assignToSprint` (`ticketId`, `sprintId`).** Plans sprint scope by moving backlog items into an active or upcoming cycle.
- **`getSprintStatus` (`sprintId`).** Retrieves burndown metrics, remaining points, and completion counts.

#### 3. Milestones, Epics & Roadmaps (Portfolio)

- **`createMilestone` (`project`, `title`, `dueDate`).** Establishes a target delivery date or release checkpoint.
- **`linkToMilestone` (`ticketId`, `milestoneId`).** Connects individual tasks or stories to a higher-level deliverable or epic.
- **`updateProjectHealth` (`project`, `status`, `summary`).** Posts executive status updates (e.g., *On Track*, *At Risk*, *Off Track*) for stakeholders.
- **`getRoadmapProgress` (`project`, `window`).** Queries completion percentages across epics or milestones over a given timeframe.

#### 4. Time, Estimates & Capacity (Resource Planning)

- **`setEstimate` (`ticketId`, `pointsOrHours`).** Assigns story points or effort estimates for sprint planning.
- **`logWorkTime` (`ticketId`, `userId`, `duration`, `note`).** Records actual hours spent on a task.
- **`getTeamWorkload` (`project`, `window`).** Checks assigned capacity and bandwidth across team members.

### Engineering & Agile Issue Trackers

- [GitLab Issues](https://docs.gitlab.com/user/project/issues/)**.** Uses projects as top-level containers and supports labels, assignees, milestones, issue linking, and closing/reopening workflows.
- [Azure DevOps Boards](https://azure.microsoft.com/en-us/products/devops/boards)**.** Organizes work items (bugs, tasks, user stories) inside projects with customizable workflow states, resolution reasons, parent/child or related links, and build/commit artifact links.
- [YouTrack](https://en.wikipedia.org/wiki/YouTrack) **(JetBrains).** Provides project-based issue tracking with custom state transitions, resolutions, tags, and rich issue-linking relations (*depends on*, *duplicates*, *relates to*).
- [Shortcut](https://www.shortcut.com/blog/clubhouses-name-is-now-shortcut/) **(formerly Clubhouse).** Built around projects/epics, story workflow states, labels, and cross-story relationships.

### IT Service Management (ITSM) & Enterprise Ticketing

- [ServiceNow](https://www.servicenow.com/)**.** Heavily relies on ticket states, resolution codes, assignment groups/users, and incident/problem linking.
- [Zendesk](https://www.zendesk.com/)**.** Uses ticket statuses (*New, Open, Pending, Solved, Closed*), tags, assignees, and ticket attachments/comments, though it leans more toward customer support than project-scoped engineering work.
- [Freshservice / Freshdesk](https://www.freshworks.com/freshdesk/)**.** Tracks incidents and service requests with status transitions, resolution notes, tags, and linked tickets.

### General Work & Project Management

- [ClickUp](https://clickup.com/)**.** Maps spaces/lists to projects and supports custom task statuses, tags, assignees, attachments, and task dependencies/links.
- [Trello](https://www.trello.com/platforms)**.** Fits simpler implementations where boards act as `project` destinations, lists act as workflow `state` transitions, and cards represent tickets.
- [Monday.com](http://monday.com/)**.** Supports project boards, status columns (workflow states), assignees, tags, and item-to-item links.

### Tools That Fit `project-management`

While overlap exists with `ticketing`, a full `project-management` driver group spans four main types of tools:

- **Kanban & Visual Board Tools.** Trello, Miro (Cards/Boards), Microsoft Planner, Kanbanize (Businessmap), and WeKan.
- **Agile & Product Development Suites.** Jira Software (Boards/Sprints/Roadmaps), Linear (Cycles/Projects/Initiatives), Shortcut, Azure Boards, and Pivotal Tracker.
- **Work Management & Collaborative Platforms.** Asana, [Monday.com](http://monday.com/), ClickUp, Wrike, Smartsheet, and Basecamp.
- **Structured Database & Spreadsheet Planners.** Notion (Projects & Sprints templates), Airtable, and Coda.

## Major Missing Categories in the Backstage Ecosystem

### `catalog` / `idp` (Internal Developer Portal & Service Ownership)

Backstage's own core Software Catalog, Scaffolder, and TechDocs—along with competing/complementary IDPs like **Port**, **Cortex**, **OpsLevel**, and **Configure8**—are foundational to Backstage plugins. Agents constantly need to look up who owns a service or scaffold new repositories.

- **Example Tools.** Backstage Software Catalog, Backstage Scaffolder, Cortex, OpsLevel, Port.
- **Key Intents.** `getServiceMetadata`, `getServiceOwner`, `listServiceDependencies`, `scaffoldTemplate`, `registerEntity`, `getComponentHealth`.

### `identity` / `access-management` (IAM, RBAC & Just-in-Time Access)

One of the most popular enterprise Backstage plugin categories (and a primary use case for agentic workflows paired with your `approval` gate) is **user/group lookup, permissions, and JIT access requests**.

- **Example Tools.** Okta, Entra ID (Azure AD), Auth0, Teleport, StrongDM, Opal, AWS IAM Identity Center.
- **Key Intents.** `getUser`, `getTeamMembers`, `grantTemporaryAccess`, `revokeAccess`, `assignRole`, `listUserPermissions`.

### `runtime` / `compute` (Kubernetes, Serverless & Container Orchestration)

As noted in your `cd` comments, `cd` deploys a version, while `infrastructure` provisions declarative specs—neither handles **day-2 live runtime operations**. The [Kubernetes plugin](https://github.com/backstage/backstage/blob/master/plugins/kubernetes/README.md) is one of Backstage's most widely installed built-in plugins.

- **Example Tools.** Kubernetes, AWS ECS / Lambda, Google Cloud Run, Nomad, OpenShift, Rancher.
- **Key Intents.** `scaleService` (replicas), `restartPodOrService`, `getPodStatus`, `execDiagnosticCommand`, `getClusterEvents`, `invokeFunction`.

### `api-management` (API Gateways, Specs & Developer Portals)

Backstage natively treats `API` entities as first-class citizens alongside `Component`s, and has a huge ecosystem of API gateway and contract-testing plugins.

- **Example Tools.** Kong, Apigee, AWS API Gateway, Postman, SwaggerHub, Gravitee, Tyk.
- **Key Intents.** `publishApiSpec`, `getApiConsumers`, `createApiKey`, `revokeApiKey`, `updateRateLimit`, `validateApiContract`.

### `crm` / `customer-support` (Customer Context & Escalations)

Many engineering/support Backstage plugins pull customer account tier, SLA status, or escalated support tickets into the developer workflow (distinct from internal engineering `ticketing`).

- **Example Tools.** Salesforce, Zendesk, Intercom, HubSpot, Freshdesk.
- **Key Intents.** `getCustomerAccount`, `getSupportTicket`, `linkSupportTicketToIssue`, `updateSupportTicketStatus`, `getCustomerSla`.

### `data-ops` / `databases` (Database Lifecycle, Migrations & Analytics)

Backstage features numerous plugins for database provisioning, schema migrations, query execution, and data catalog lineage.

- **Example Tools.** Snowflake, Databricks, Neon, PlanetScale, AWS RDS, Liquibase / Flyway, DataHub / Amundsen.
- **Key Intents.** `createDatabaseBranch`, `takeDatabaseSnapshot`, `restoreSnapshot`, `runSchemaMigration`, `getSlowQueries`, `getDatasetLineage`.

### `storage` (Object, Blob & File Storage)

- **Why it's distinct.** `artifact` manages versioned packages/containers, `documentation` manages human-readable wikis, and `databases` manages structured queryable tables. None of those cover raw bucket/object operations that cloud plugins expose.
- **Example Tools.** AWS S3, Google Cloud Storage, Azure Blob Storage, MinIO, Cloudflare R2.
- **Key Intents.** `putObject`, `getObject`, `listObjects`, `deleteObject`, `generatePresignedUrl`, `setBucketLifecycle`.

### `messaging` / `streaming` (Event Buses, Queues & Topics)

- **Why it's distinct.** Many Backstage plugins exist specifically to inspect Kafka topics, consumer group lag, dead-letter queues (DLQs), and message schemas—actions that do not fit into `compute`, `databases`, or `observability`.
- **Example Tools.** Apache Kafka (Confluent, Strimzi), AWS SQS / SNS / EventBridge, RabbitMQ, Google Pub/Sub, NATS.
- **Key Intents.** `publishEvent`, `getTopicLag`, `listDeadLetterMessages`, `replayDeadLetterQueue`, `registerEventSchema`, `purgeQueue`.

### `dns` / `networking` (Domains, Certificates & Traffic Edge)

- **Why it's distinct.** While `infrastructure` provisions resources from a spec, operational runbooks frequently need imperative edge actions—such as failing over DNS records, purging CDN caches after a deploy, or renewing TLS certificates.
- **Example Tools.** Cloudflare, AWS Route 53, Akamai, Fastly, Let's Encrypt / cert-manager, HashiCorp Consul.
- **Key Intents.** `upsertDnsRecord`, `deleteDnsRecord`, `purgeCdnCache`, `issueCertificate`, `renewCertificate`, `toggleMaintenanceMode`.

### `ai` / `mlops` (Model Registries, Prompts & Vector Stores)

- **Why it's distinct.** Modern Backstage ecosystems increasingly include plugins for managing LLM prompt versions, model deployments, evaluation runs, and RAG knowledge indexes—which carry unique primitives (`modelId`, `promptVersion`, `indexId`) that don't fit cleanly into `artifact` or `databases`.
- **Example Tools.** Weights & Biases, MLflow, Hugging Face Hub, LangSmith / Braintrust, Pinecone / Weaviate.
- **Key Intents.** `promoteModel`, `getModelMetrics`, `updatePromptTemplate`, `runEvaluationSuite`, `reindexVectorStore`.