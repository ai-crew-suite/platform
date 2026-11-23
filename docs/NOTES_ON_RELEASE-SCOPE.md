# Notes on `requirements/RELEASE-SCOPE.md`

## Standalone Driver Gateway Service

I need more information to understand this (extracted gateway, MCP facade, network-isolated OBO). It's item DF-02 in "4. Explicit Deferrals".

## `AgentContext` facade

In section `3.1 Subsystem 01 — Workflow Authoring & Graph Definition SDK` of `docs/requirements/RELEASE-SCOPE.md`, we've included `AgentContext` (`ctx.*`) facade in the Proposed Launch category.

> ***Does using a facade like this make sense? How does it handle pushing work into a Temporal worker, and the memory space is no longer shared with the core platform plugin?***

**Unresolved:** Whether `ctx.*` primitives stay a separate facade or become governed capabilities (OWN-07; 04 §Reconciling `AgentContext` Primitives into Governed Capabilities).

