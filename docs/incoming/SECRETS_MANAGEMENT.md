# Vault Implementation Plan

`StateSerializer.ts` (The Cryptographic Guard)

- **What it does:** It acts as an encryption and decoding engine for orchestrator graph checkpoints [Step 14].
- **The Mission:** Before a sensitive snapshot of conversational state is written to the cold database (`CheckpointStore`), the engine calls `StateSerializer.serialize()`. If an enterprise supplies a high-security implementation (like an AWS KMS envelope serializer), it turns clear text context into opaque, encrypted ciphertext blocks (`Uint8Array`) [Step 14]. This fulfills **Section C.2 (Sensitive Payload Opaque Isolation)**.

### 🗺️ System Blueprint Relationship

![tool-state-relationship](/home/kevin/Repos/ai-crew-suite/platform/docs/incoming/images/tool-state-relationship.jpg)



The secrets management ecosystem is divided into three primary categories based on infrastructure preferences:  **cloud-native services**, **SaaS-first/developer-focused platforms**, and **open-source or self-hosted alternatives**.

When designing your Backstage internal developer portal (IDP), choosing an option depends on whether your organization is fully invested in a single cloud provider or operating across hybrid, multi-cloud architectures.

## Cloud-Native Managed Services

If your infrastructure resides primarily within a single hyperscaler, the native options are highly integrated, completely managed, and utilize standard Identity and Access Management (IAM) for authentication.

- **AWS Secrets Manager:** The default choice for AWS-centric teams. It features **native integration with Amazon RDS** for automated database credential rotation. *(Note: AWS also offers AWS Systems Manager Parameter Store, which acts as a lower-cost alternative for simpler configuration data and lightweight encrypted strings).*
- **Google Cloud Secret Manager:** A streamlined, simple secret repository built for the Google Cloud ecosystem. It utilizes standard GCP IAM permissions and handles version control out of the box.
- **Azure Key Vault:** Microsoft’s secure repository that handles not just application secrets, but also hardware security modules (HSM), cryptographic encryption keys, and **automated SSL/TLS certificate renewals**. It integrates natively with Microsoft Entra ID.

## Developer-Focused & SaaS-First Platforms

These platforms are designed to avoid the operational overhead of running a large HashiCorp Vault instance while providing a cross-cloud developer experience.

- **Doppler:** A highly popular developer-focused tool. It handles environment-based secrets (dev, staging, prod) and **synchronizes them automatically in real time** across hosting platforms like GitHub Actions, Vercel, and Kubernetes pods.
- **Akeyless Vault Platform:** An enterprise-grade, SaaS-based platform that uses a proprietary "vaultless" encryption technique. It delivers **HashiCorp Vault-like features (such as dynamic credential generation)** without requiring you to manage backend servers or scaling logistics.
- **Infisical:** A rapidly growing, modern alternative tailored explicitly for developer ergonomics. It can be consumed via their cloud SaaS or self-hosted, and it includes advanced features like an **Agent Vault for non-human identities**.

## Open-Source & Drop-in Vault Alternatives

Since HashiCorp moved Vault to a restrictive Business Source License (BSL), several open-source paths have emerged to preserve the community ecosystem.

- **OpenBao:** A community-led fork of HashiCorp Vault maintained under the **Linux Foundation**. Because it was forked directly from the last open-source version of Vault, it is **fully API-compatible**, allowing you to swap it out directly without changing your existing application or pipeline code.
- **Bitwarden Secrets Manager:** An open-source, end-to-end encrypted secret store designed by the creators of the popular password manager. It provides a developer-friendly CLI and SDK array tailored for smaller teams or open-source deployments.

## Does Backstage have a built-in API for Secret Management?

**No. Backstage does not provide a native `coreServices.secrets` wrapper or a uniform KMS API interface**.

As shown in the official Backstage coreServices catalog, services are limited to infrastructure tasks like `database`, `cache`, `logger`, and `scheduler`. Backstage intentionally avoids secret management because it expects you to inject sensitive strings directly at the infrastructure runtime layer.

Instead, Backstage relies on its **`coreServices.rootConfig` system to resolve secrets dynamically from environment variables at startup.**

```yaml
# app-config.yaml configuration example
datadog:
  apiKey: ${DATADOG_API_KEY}  # Backstage automatically parses this env var on boot
```

## How Kubernetes Secret Objects Map to Environment Variables

**No, Kubernetes secrets are not standard environment variables automatically.** You must explicitly tell Kubernetes to inject them into your container during deployment.

If you store your Datadog or PagerDuty tokens inside a Kubernetes Secret object named `agent-platform-secrets`, you must map those values inside your **Deployment manifest configuration**. You have two common ways to handle this layout:

### Option A: Bulk injection (`envFrom`)

This approach takes every single key-value pair inside the Kubernetes Secret and exposes it directly as a standard uppercase environment variable inside your Node.js container runtime:

```yaml
spec:
  containers:
    - name: backstage-backend
      image: backstage:latest
      envFrom:
        - secretRef:
            name: agent-platform-secrets # Converts all keys inside this secret to env vars
```

### Option B: Granular variable mapping (`valueFrom`)

If you want strict variable governance, you map individual keys explicitly:

```yaml
spec:
  containers:
    - name: backstage-backend
      image: backstage:latest
      env:
        - name: DATADOG_API_KEY
          valueFrom:
            secretKeyRef:
              name: agent-platform-secrets
              key: datadog-token
```

Once your deployment manifest is applied, **Node.js reads these values natively via `process.env.DATADOG_API_KEY`**, which means your TypeScript plugin code never has to know that Kubernetes or an external secret manager was involved.

## Are there unified KMS Plugins or abstraction wrappers for Backstage?

**No. There is no unified ecosystem plugin that acts as a runtime abstraction layer for KMS vendors.**

You will not find a plugin that lets you change a config value from `provider: vault` to `provider: aws-secrets` and call a generic `.getSecret()` method in your plugin. The Backstage ecosystem solves this external connectivity issue using standard **Cloud Native Architecture Design Patterns**:

### The Kubernetes Way: External Secrets Operator (ESO)

Rather than pulling credentials inside your JavaScript application space, organizations deploy the industry-standard **External Secrets Operator (ESO)** onto their cluster.

1. ESO speaks directly to HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault using cloud IAM roles.
2. It fetches the credentials and synchronizes them down into native Kubernetes Secret objects.
3. Your deployment spec maps those secrets straight to environment variables.

### The Non-Kubernetes Way: Entrypoint Wrappers

If your users run Backstage on basic VM instances or bare docker containers without Kubernetes, they utilize runtime wrappers like the **HashiCorp Vault Agent** or the **AWS CLI entrypoint wrapper**. These tools wrap around the Node start script (`aws-env exec -- yarn start`), pulling strings down from the KMS and injecting them as environment variables right before the Node process boots up.

## Summary Strategy for your Greenfield Design Document

Enforce an **"Environment Driven Credentials" Policy** inside your design specifications:

- Ensure your core backend router and drivers read configurations strictly through Backstage's native config API (`config.getString('datadog.apiKey')`).
- Document that it is the responsibility of the deployment team to use tools like **ESO** or container mappings to inject these credentials securely on deployment.

This architectural line guarantees that your open-source code remains highly secure, lightweight, and completely untangled from complex third-party KMS API SDK overheads.
