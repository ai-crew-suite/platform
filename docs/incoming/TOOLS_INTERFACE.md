# Tools Interface Planning

We need to architect our tool-calling system for the platform. Tools are third-party platforms, like GitHub and Slack. We currently have them organized in eight groups:

drivers
├── cloud-providers
├── communication
├── finops
├── incident-management
├── observability
├── project-management
├── quality-scorecards
└── vcs

The target audience for this project is highly regulated, enterprise environments meeting compliance requirements like FINRA, SOC-2, and HIPAA. The project is an agentic workflow plugin for Backstage IDP. Agents are backend and frontend pairs that consume the Platform's fluent API to author agent workflows and provide useful extensions to Backstage. Agents should be able to call drivers to access tools for their work.

Originally my plan was to restrict drivers to synchronous calls. Each of the eight groups would have a base contract that tools in that group would be expected to fulfill. For example, VCS drivers would be expected to have methods like "getPullRequestStatus" and "tagRelease". Individual drivers in a category could offer additional methods specific to that platform - and agents would be responsible for being aware of that fact. An example would be agents written in-house for an installation that make use of custom features available only in that organization, or to offer progressive enhancement of an agent's functionality depending on what drivers are registered in an instance.

Some constraints:

- Calls may be synchronous or asynchronous.
- Agents need a way to specify whether drivers in a given category are mandatory or optional. For example, a plugin might require a vcs plugin to do its work. But it may optionally make use of a finops plugin if one is available.
- Agents need a way to specify that expanded functionality, beyond the base contract, is required. For example, a plugin that makes use of particular extended features common to extended VCS platforms might not work if the vanilla Git driver is used.
- Similarly agents need a way to specify that a particular driver or set of drivers (either all of them or one of a group), is required. For example, a plugin that's tailored to GitHub's particular extended features might not work if any other VCS platform is registered as the vcs provider. Or certain features might depend on having both a finops and project-management driver installed and available.
- We need a clean and explicit way to handle credentials. Some drivers might depend on having a user's individual credentials passed through the Backstage backend, like GitHub. Others might depend on an organization-wide or sub-organization-wide credential that's configured for the Backstage instance, like Datadog. Some might need both, or be able to use either.
- Backstage has a built-in RBAC system. Drivers need to integrate with that system with granular control over what actions they can take, and what credentials they can use for those actions (for example allowing user credentials for an action but not organization-wide credentials).
- Plugins need a sophisticated caching system. They should be able to avoid rate limiting on external platforms. I'm not sure exactly what capabilities the caching system needs.
- The system might need to accommodate a relatively high volume - perhaps several thousand developers interacting with it at one time.
- We have a hard dependency on Temporal, so it can be used in our design.

I recently did work on a project called Conduit that is a build observability/orchestration tool. I could be wrong on the naming, I think it refers to capabilities of what I'm calling drivers as "Seats". It maintains a catalog of these capabilities that look like this:

```go
Name: "tagRelease", Category: "scm", Args: "repo, tag, ref", Fill: map[string]SlotFill{"repo": {Class: FillNone}, "tag": {Class: FillAny}, "ref": {Class: FillAny}}},
```

Conduit's design is intended to allow a layered approach to extending the capabilities of any given driver; a core set of capabilities any driver ("Tool") in that category must fulfill, vendor-specific capabilities it can be extended with, and end-user code that further extends it. I think it refers to these layers as "slots", and it segregates those layers for visibility to the best of my understanding. It has "Performers" that are able to take actions, like opening an issue on Gitea, and are Go code compiled into the core. It also has "Plugins" that run in a WASM isolate and offer more limited capabilities (they do not have access to credentials) and are intended at least for polling (reads), along with perhaps other capabilities. I do not understand why Conduit breaks those two functions into completely separate systems.

The Conduit repo is at /home/kevin/Repos/sol-duara/conduit-go

Please review that repo to get a blueprint of its design patterns. Then, I'd like to get a few different overall architectures that would make sense for our driver layer. The reason I ask that you look at Conduit first is because I had not seen that particular design pattern before, and if it's useful, I'd like to ask you to offer an architecture using any concepts it has that make sense.

The proposed architectures should be highly robust, enterprise-grade approaches. Four or five variants are optimal, but if there's really only a couple sound ways of doing this or one or two approaches are clearly superior to all others, there's no need to expand the list just for the sake of offering alternatives.
