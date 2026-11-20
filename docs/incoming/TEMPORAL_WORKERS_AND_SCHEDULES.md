# Temporal Workers and Schedules

## How a Temporal Worker Works

A Worker acts as the bridge between your application code and the Temporal cluster through a continuous execution loop. Unlike traditional architectures where a central server pushes jobs to compute nodes, Temporal Workers are separate from the Temporal Service and operate on a **pull-based polling model**. Because you deploy and run Workers inside your own infrastructure, the central Temporal Service never needs direct access to your internal databases, private networks, or API keys.

- **Long Polling.** The Worker connects to a specific Temporal Namespace and continuously polls a designated **Task Queue** to ask if work is available.
- **Dequeueing Tasks.** When a task appears on the queue, the Worker pulls it down along with its input data, timeout configurations, and retry policies.
- **Code Execution.** Depending on the task type, the Worker either replays event history to advance deterministic Workflow state or runs non-deterministic Activity functions (such as calling third-party APIs or querying a database).
- **Reporting Results.** Once execution finishes or pauses for a timer, the Worker sends commands or results back to the Temporal cluster so the overall Workflow can move forward.

### Key Capabilities & Benefits

- **Language Flexibility.** You build Workers using a [Temporal SDK](https://docs.temporal.io/encyclopedia/architecture/how-temporal-works) in your preferred programming language, such as Go, Java, TypeScript, or Python. Different Workers written in different languages can even collaborate on the same Workflow by listening to separate Task Queues.
- **Built-in Concurrency Control.** Each Worker manages its own execution slots, allowing you to tune the exact number of concurrent Workflows and Activities it processes based on available memory and CPU.
- **Seamless Horizontal Scaling.** You can run as many identical Worker processes as needed across virtual machines, Kubernetes pods, or serverless environments like AWS Lambda. Adding more Workers polling the same Task Queue automatically increases throughput.
- **Data Security & Isolation.** Because Workers initiate outbound connections to the Temporal Service and run inside your environment, sensitive application payloads and credentials stay completely within your security perimeter.

## Temporal Schedules

A **Temporal Schedule** is an independent, durable entity inside the [Temporal Service](https://docs.temporal.io/temporal-service) that automatically starts **Workflow Executions** at specific, recurring times.

Unlike legacy [Temporal Cron Jobs](https://docs.temporal.io/cron-job) or external tools like Kubernetes CronJobs, a Schedule has its own unique ID and lifecycle completely separate from the Workflows it triggers. This allows you to manage, update, or pause recurring jobs dynamically through the Temporal UI, CLI, or SDKs without modifying or redeploying your Worker code. [[1](https://docs.temporal.io/evaluate/features/schedules), [2](https://keithtenzer.com/temporal/Temporal_Schedules_Design_Guidance/)]

- **Spec (When to Run).** You can define timing using simple intervals (such as every 45 minutes), standard Unix cron strings, or structured calendar expressions that support specific time zones, exclusion dates, and random jitter.
- **Action (What to Run).** The Action specifies the Workflow Type, target Task Queue, input parameters, and timeout configurations to use each time the Schedule fires. Every triggered run becomes a standard, durable Workflow Execution with full retry capabilities and Event History.
- **State & Metadata.** Each Schedule tracks its own operational status (active or paused), total action limits, upcoming scheduled run times, and references to its most recent completed or failed runs.

### Key Capabilities & Policies

- **Overlap Policies.** You can strictly control what happens if a new run is due while a previous run is still executing. Options include skipping the new run (`Skip`), queuing one or all pending runs (`BufferOne`, `BufferAll`), canceling or terminating the active run (`CancelOther`, `TerminateOther`), or running them concurrently (`AllowAll`).
- **Backfilling.** You can trigger a Schedule to execute retroactively across a past time range. This makes it easy to recover missed data pipelines or test recurring logic against historical windows.
- **Dynamic Lifecycle Controls.** Operators can pause, unpause, manually trigger an immediate run, or edit the timing spec on the fly via the [Temporal CLI](https://docs.temporal.io/cli/command-reference/schedule) or SDK clients.
- **Failure & Outage Protections.** Schedules include a configurable **Catchup Window** (defaulting to one year) to dictate how far back to recover missed runs after a cluster outage, as well as a **Pause-on-Failure** setting that automatically halts the Schedule if a triggered Workflow fails.

