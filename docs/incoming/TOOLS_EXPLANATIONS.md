# Tools Explanations

## Section 1.3 Layering

> **Catalogue (common):** `pkg/seat/catalogue.go`. Shared, given away, tool-neutral.

“Shared” means the **common capability names and their meanings** are meant to be reusable across providers. For example, `createPullRequest` in the `scm` category describes an intent without committing an agent to GitHub, GitLab, or another provider.

“Given away” is Conduit’s design philosophy: the vocabulary is open for anyone to implement, rather than being controlled by one vendor. It does **not** mean credentials, implementation code, or the runtime are shared. The important invariant is that implementations agree on what each common word means; otherwise, an agent using `createPullRequest` could behave differently when switched between providers.

For example, an agent could request:

```go
scm.createPullRequest(repo, source, target, title, body)
```

A GitHub driver could translate that into GitHub’s API fields; a GitLab driver could translate it into GitLab’s. The agent keeps using the common capability.

> - **Brand:** words the performer declares through the `Vocabulary` interface, namespaced by brand. If a performer declares a word in another brand's spelling, boot stops.

“Spelling” means the capability’s **literal name and namespace**—not spelling variations.

- A common word might be named `createPullRequest`.
- A GitHub-specific word is namespaced as `github.dispatchWorkflow`.
- A GitLab-specific word might be `gitlab.triggerPipeline`.

The namespace makes provider-specific features visible to the agent author. If a GitHub performer declared a word named `gitlab.triggerPipeline`, that would look like GitLab’s capability being claimed by GitHub. Conduit treats that as an invalid declaration and stops startup.

> - **Author:** connector seats declared in the console. A connector seat can *fulfil* a common word and so join that word's resolution walk.

Here, “console” means **Conduit’s web interface for configuring the installation**. An administrator can declare a custom capability for a configured connector there, rather than adding that capability to Conduit’s built-in catalogue or shipping a compiled-in performer.

For example, an organization might configure a connector called `radar` and declare `radar.fileProblem` for an internal service. If it also declares that this capability fulfils the common `createProjectTicket` intent, Conduit can consider that connector when resolving the common word.

So “author” means the organization that defines the custom capability; it doesn’t mean an end user typing a word into a prompt. In the document, “connector seats” is shorthand for capabilities declared for a configured connector.

*I used “connector” ambiguously there.* I meant a configured connection to an external system—what Conduit otherwise calls a tool instance—not Conduit’s Connector component.

For example, an administrator could configure a radar tool instance with its service URL and connection settings, then define the custom capability `radar.fileProblem` for it. “Configured connector” in my sentence should have been “configured tool instance.”

Conduit’s Connector (capitalized in its code and design) is different: it’s the central gateway that makes outbound calls and applies credentials.

## Section 1.5 Conduit concepts worth adopting

> Multi-step `Fill → next Intent`, capped (`MaxSteps = 4`)

“Next” means the next HTTP request in the same capability invocation—not the next workflow step or a different capability. The driver’s `Fill` function receives a response and can either finish with a result or return another Intent for the gateway to send. For example, a Jenkins driver might first request a Cross-Site Request Forgery (CSRF) crumb, then use the crumb in a second request to trigger a build. `MaxSteps = 4` caps how many request / response steps that one invocation can take, preventing an accidental or faulty loop from running indefinitely.

> Determinate answers and a per-caller capability report

By capability report, I meant a separate discovery/preflight response that lists the capabilities an agent could use and their status for a particular caller. It lets the UI or agent know what’s available before invoking anything—for example, whether GitHub is connected or a required capability isn’t supported by the selected provider. The report helps explain availability in advance; it doesn’t execute the capability. A simplified example:

```json
{
  "capabilities": [
    { "id": "vcs.pullRequest.create", "status": "ready" },
    { "id": "github.actions.dispatchWorkflow", "status": "connect_account" },
    { "id": "vcs.release.publish", "status": "not_served", "servedBy": ["github-prod"] }
  ]
}
```

> Slot `Fill` classes - Becomes *slot provenance* for prompt-injection defense.

A **slot** is just an input field to a capability. *Slot provenance* says where that field is allowed to come from and whether the model may choose it. For example, when an agent creates a pull request:

| Input              | Provenance    | Why                                                          |
| ------------------ | ------------- | ------------------------------------------------------------ |
| `repo`             | `context`     | The gateway takes it from the repository the user selected - not from text the model generated. |
| `baseBranch`       | `context`     | The gateway uses the repository’s configured default branch. |
| `title` and `body` | `model`       | The model can draft these, subject to length and content checks. |
| `reviewer`         | `constrained` | The model may suggest one, but the gateway checks it against the repository’s allowed reviewers. |

This helps with prompt injection because untrusted text—such as repository contents or an issue description—might tell the model to target a different repository or branch. The model can be influenced by that text, but it cannot redirect those `context`-provenance inputs: the gateway supplies them from trusted run context and rejects or ignores model-supplied replacements.

This is a **proposed adaptation** of Conduit’s `Fill` idea, not a feature Conduit calls “slot provenance.” It also isn’t a replacement for RBAC: provenance constrains the source of arguments; RBAC decides whether the caller and agent are allowed to perform the capability at all.

> Slot `Fill` classes

In Conduit, **Fill describes how a no-code subscription can supply the arguments (“slots”) to a Koine word when an event arrives**. It is metadata on each word’s declaration; it is not the driver’s request/response `Fill` method.

For example, `notifyChannel` has `channel` and `message` slots. A subscription might say: when a build event arrives, send a message to `#releases` containing the event’s `applicationName`. The subscription’s template supplies those values; when the event arrives, Conduit renders the template and calls the word with the resulting arguments.

The Fill class tells the subscription UI and validation code how to treat each slot:

- **`FillAny`**: event fields can be used. This is the default when no rule is declared.
- **`FillNone`**: the form should not offer an event-field picker for this slot; the value is expected from the connection or subscriber.
- **`FillRange`**: suggest certain event fields first in the form.
- **`FillSpecific`**: declare that an event paired with this word must have a particular field in its schema.

A nuance: these classes are **not strict restrictions on what a subscriber may enter**. In the current implementation, `FillNone` and `FillRange` don’t reject event-field references, and `FillSpecific` checks that the required field exists in the event schema—it doesn’t force the subscription’s template to use that exact field. Separately, a template that references a field the event schema doesn’t declare is rejected. See `slotfill.go` and `subscribe_fill_test.go`.

So Conduit’s Fill is mostly **form guidance plus a check that a required field is available**. It is not a security boundary. That differs from the proposed *slot provenance* idea, which would enforce whether an LLM can supply an argument or whether the gateway must supply it from trusted context.

> no-code subscription

A **no-code subscription** is a rule configured in Conduit’s console that says, in effect:

*“When an event matching this subscription arrives, run this reaction with these arguments.”*

For example: when a build-finished event arrives, call the `notifyChannel` verb, set the channel to `#releases`, and use an event field in the message. The subscription can be configured to call a common verb directly; the `Fill` metadata helps describe how its argument slots can be populated.

It’s **passive and event-triggered**: the subscription reacts after an event arrives. It is not the workflow’s ordered plan, and it doesn’t replace a controller. A controller is code that handles events within a workflow run and can explicitly call verbs; a subscription is a separately configured reaction. Conduit also supports script-based subscriptions, so “no-code” specifically describes the configurable reaction path, not every possible subscription.

> I know with Conduit we author workflows. Those workflows call controllers (not certain) to exercise their plan (steps). My mental map is of a declarative process, where a workflow proceeds step by step - querying external systems via plugins to see if their work is finished, or exercising performers to initiate actions.
>
> But the description of a "subscription binds an incoming event to a verb" sounds more like a passive system - where Conduit is just waiting for events to happen, capturing them, and building a map of what happened and correlating it into a single entity.

**Both models exist in Conduit, but they are separate paths.** My earlier wording about `Fill` referred only to the subscription path; it does not describe how workflows and controllers call verbs.

Your mental model is **partly right**: a workflow declares an ordered plan of expected events, and the engine waits for those events. But it does **not** automatically call a performer for each step, and the controller does not query capabilities and bind a call to a verb automatically.

The workflow/controller path is roughly:

```text
Workflow declares expected events and their tools
        ↓
An event arrives and is matched to its workflow coordinate
        ↓
The controller receives the arrival
        ↓
Controller code may explicitly call a Koine verb
        ↓
The verb resolves a tool and its performer carries out the action
        ↓
The workflow waits for its next expected event
```

The controller chooses what to do in code: it can inspect an arrival, then explicitly call a verb with arguments it constructs. The engine does not map event fields to verb arguments by matching their names. A verb call’s response is the response to that action; it does **not automatically settle a workflow coordinate**. The expected event normally arrives from the tool or another emitter. If it doesn’t arrive before the coordinate times out, a configured plugin may query the tool and backfill the expected event.

Separately, a **subscription** is a passive, event-triggered reaction: “when this event arrives, call this verb.” Its configuration supplies the verb’s arguments, potentially using values templated from the event. **That is the context where `Fill` describes slots**—mostly as form guidance, plus a check that a required event field exists.

So there are two distinct relationships:

- **Workflow/controller:** an arrival is delivered to controller code, which may explicitly call a verb.
- **Subscription:** an arrival triggers a configured verb, whose arguments may be filled from that event.

> Is there any relationship between the two or overlap between the Workflow/controller execution path and the Subscription execution path?

There is a relationship: **subscriptions watch events from workflow runs**, but they do not become part of the producer workflow’s declared plan.

A subscription can watch either a named event in a particular workflow or, if authorized, an event type wherever it occurs. When a matching event is recorded, Conduit can deliver it to the subscriber. Depending on the subscription’s configuration, it can:

- **Just receive it** (observe).
- **Run a reaction**: call a Koine verb or run a script, using the subscriber’s identity and the event data the subscriber is allowed to see.

The primary use case is **independent reactions to events**—for example, notifying a team when a deployment finishes, or having a compliance consumer receive a relevant event across workflows—without requiring each producer’s workflow to include that behavior. A subscription’s trigger can also defer delivery until a run completes or breaches.

**A subscription cannot edit a workflow definition or add/remove its expected steps through the UI.** It is a separate consumer; the workflow can run without knowing it exists. But a reaction is not necessarily impact-free: it can call an external system, and a verb response that is itself a valid event envelope can be routed back through Conduit’s event door. If that event matches a pending workflow coordinate, it may satisfy that coordinate. That is an indirect effect through normal event processing—not a subscription changing the workflow plan.

So the distinction is: **the workflow/controller defines and processes the run; the subscription independently observes selected events and may react to them.**

Subscriptions are more than database records: the record stores the rule—what event to watch, when to deliver it, and optionally what reaction to run. The engine matches recorded events against those rules, writes delivery records, and runs configured reactions. They can be created through the console or the HTTP API; they aren’t UI-only.

On scripts: you don’t upload a script file through the subscription form. A script:<id> reaction refers to code already registered in the Conduit deployment. In the current design, that code is a compiled-in KoineDSL controller/station; adding one requires adding it to the codebase and rebuilding. The console lets you reference it, not install it.

And yes—with one nuance—the console subscription/reaction system is separate from the WASM plugin runtime. A subscription reaction of script:<id> runs registered controller code; it does not launch a WASM plugin. But both systems can react to events: Conduit’s WASM plugins have a separate reactor role that runs on subscribed events.

> Are subscriptions similar to AOP in languages?

Subscriptions let you add cross-cutting reactions—such as notifications, compliance reporting, or metrics—across workflows without adding that behavior to each workflow’s controller.

But they’re not AOP in the strict sense. AOP typically weaves advice around program execution points, potentially before, after, or instead of a call. A Conduit subscription instead observes an event after it is recorded and may run an independent reaction. It doesn’t wrap the workflow’s steps, intercept controller calls, or change the workflow definition.

So I’d describe subscriptions as event-driven, cross-cutting reactions, rather than AOP.

## Section 2.1 Capability identity and layers

> A vendor word promotes to `core` when a second provider can serve it meaningfully.

Promotion adds a neutral core word; it doesn’t turn the GitHub word into a cross-provider name. Conduit’s rule says that once a feature is meaningfully supported by multiple providers, it can be added to the common catalogue under a provider-neutral name. The original vendor word stays available for compatibility and for callers who need that provider’s specific behavior.

For example, `github.actions.dispatchWorkflow` describes a GitHub-specific operation. If GitLab offers a meaningfully equivalent operation, the catalogue might add something like `ci.pipeline.trigger`. A GitHub performer maps that core word to its GitHub operation; a GitLab performer maps it to its GitLab operation. The GitHub-branded word remains GitHub-specific—it doesn’t become the name to use with GitLab.

Your compatibility assumption is right: keeping the vendor word avoids breaking existing callers. There’s also a semantic reason not to make every vendor feature core: superficially similar APIs may differ in behavior or guarantees. The document doesn’t say there’s no preference for core words; it sets a bar for them—shared, meaningful semantics—while retaining vendor words rather than retiring or repurposing them.

A **mapping is an adapter from a provider-neutral capability to a provider-specific operation**. It does two things: selects the provider’s operation and translates the common capability’s arguments into the argument names and shape that operation expects.

For example, imagine a common capability:

```go
ci.pipeline.trigger(project, ref, variables)
```

A GitHub performer might map it to `github.actions.dispatchWorkflow`:

```text
project   → split into owner + repo
ref       → ref
variables → workflow inputs
```

A GitLab performer might map the same common capability to `gitlab.triggerPipeline`:

```text
project   → project
ref       → ref
variables → pipeline variables
```

At runtime, the caller asks for the **common** capability. Conduit resolves which provider instance will serve it, finds that performer’s mapping, translates the arguments, then asks the performer to prepare and execute the provider-specific call. The performer handles the actual API request and response; the mapping itself does not call the external system.

If the selected performer has no mapping for the common capability, Conduit reports that it is **not served** rather than guessing. A caller can instead request a vendor-specific word directly, but that explicitly ties the caller to that provider.

> - A driver that declares a word outside its own namespace fails boot.

Namespace means the provider’s name prefix in a provider-specific capability ID. It is not the capability’s category. For example, a GitHub performer might declare:

```bash
github.dispatchWorkflow
```


with category `ci`. Here, `github` is the namespace; `ci` is the category. A GitHub performer declaring `gitlab.triggerPipeline` would be using another provider’s namespace, so Conduit rejects it at startup. An unprefixed provider-specific word is also invalid.

Common capabilities are separate: they have provider-neutral names, such as `triggerPipeline`, and a GitHub performer maps that common word to its own `github.dispatchWorkflow` operation.

So: category answers “what kind of capability is this?”; namespace answers “whose provider-specific capability is this?”

I need to correct the terminology from the options document: `<orgns>.<provider|category>.<verb>` was a proposed naming scheme for our architecture, not a Conduit rule. Conduit doesn’t classify words using that three-part format.

In Conduit, a word’s origin and declaration distinguish it:

- A common word is in the shared catalogue, such as createPullRequest. Its category (e.g. `scm`) is a separate field, not part of its name.
- A brand word is declared by a performer, such as `github.dispatchWorkflow`. The performer’s name establishes the provider prefix; its declaration supplies the word and category.
- An author word is declared for a custom connector, such as `radar.fileProblem`.

- So Conduit doesn’t need a global list of every possible vendor name to parse names. It knows which performers are present in the deployment and which words they declare. A new vendor can be supported by adding and registering a performer; because that performer is compiled into the deployment, it must be included in the running build. The generated typed Go wrappers use a compile-time list of shipped brands, but that’s for code generation—not a universal registry that prevents new vendors from being added.

Also, “noun” isn’t a separate Conduit concept or a compiled catalogue in this naming model. I used noun in the proposed scheme as a way to group related operations; Conduit’s declarations have a word name, category, and argument slots, not a separately registered noun taxonomy.

## Section 5. Server-Side Token Broker Scope of Work

> The backend must securely bind the OAuth callback to the initiating Backstage user and provider instance, protect the flow against CSRF and callback substitution, and use PKCE where supported or required.

**PKCE** (pronounced "pixie," short for **Proof Key for Code Exchange**) is a security extension to the OAuth 2.0 authorization code flow. It protects public clients (like mobile apps, Single Page Applications, and CLI tools) from **authorization code interception attacks** when exchanging an authorization code for an access token.

Why PKCE Exists

In a standard OAuth 2.0 flow, a backend server uses a static `client_secret` to prove its identity when trading a temporary authorization code for an access token. However, apps running on a user's device cannot safely hide a static secret because anyone can inspect the app's binary or browser code.

- **The vulnerability.** Without PKCE, if a malicious app on a phone or browser intercepts the redirect URL containing the temporary `code`, it can exchange that `code` for the user's access token.
- **The PKCE fix.** Instead of relying on a pre-shared static secret, PKCE generates a **fresh, one-time cryptographic secret** for every single login attempt.

How the PKCE Flow Works

PKCE adds three simple steps to the standard OAuth 2.0 authorization code grant:

1. **Generate a verifier and challenge.** Before redirecting the user to log in, the client generates a high-entropy random string called the **`code_verifier`**. It then hashes that string (typically using SHA-256) to create a **`code_challenge`**.
2. **Send the challenge with the login request.** The client redirects the user to the authorization server (such as Okta, Auth0, or GitHub) along with the `code_challenge` and `code_challenge_method=S256`. The server remembers this challenge and returns a temporary `code` after the user logs in.
3. **Prove possession with the verifier.** To exchange the `code` for an access token, the client sends the original plain-text **`code_verifier`** to the token endpoint. The authorization server hashes the received `code_verifier` and checks that it matches the `code_challenge` from step 2—proving that the app requesting the token is the exact same app that started the login.

When You Should Use PKCE

- **Public clients (Mandatory).** Always required for Single Page Applications (React, Vue, Angular), native mobile apps (iOS, Android), desktop apps, and CLI tools.
- **Confidential server-side clients (Recommended).** Under the **OAuth 2.1** specification, PKCE is now recommended (and often required by modern identity providers) for *all* authorization code flows—even traditional backend web servers that also use a `client_secret`—as defense-in-depth against code injection and CSRF attacks.

### 
