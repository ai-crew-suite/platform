## Mixin Pattern

### The Core Constructor Type

To create a mixin in TypeScript, you first need a type that represents *any* class constructor. This is defined in your `base.ts` file so every mixin can accept it.

```typescript
// engine/fluent/base.ts
export type Constructor<T = {}> = new (...args: any[]) => T;

// This represents the shared internal configuration state 
// that all the different mixins will manipulate.
export class BaseAgentBuilder {
  protected config: Record<string, any> = {};

  constructor(...args: any[]) {}
  
  getConfig() {
    return this.config;
  }
}
```

### The Composition Root

In your main `builder.ts` file, you create your final product by nesting the mixin functions. TypeScript automatically tracks and combines all the types, providing full autocompletion for all 50+ methods on the final object.

```typescript
// engine/fluent/builder.ts
import { BaseAgentBuilder } from './base';
import { IdentityMixin } from './agent/identity';
import { ModelMixin } from './agent/model';
import { LongTermMemoryMixin } from './memory/long-term';
import { ShortTermMemoryMixin } from './memory/short-term';
import { SignalMixin } from './workflow/signals';
import { LifecycleMixin } from './workflow/lifecycle';
import { ToolMixin } from './tools/standard';
import { RetrievalMixin } from './retrieval/search';

// 1. Define an array of all your mixin factories
const mixins = [
  IdentityMixin,
  ModelMixin,
  LongTermMemoryMixin,
  ShortTermMemoryMixin,
  SignalMixin,
  LifecycleMixin,
  ToolMixin,
  RetrievalMixin,
];

// 2. Reduce the array linearly onto the base class
const FullyComposedBuilder = mixins.reduce((Base, mixin) => mixin(Base), BaseAgentBuilder);

// 3. Export the final class cleanly
export class AgentBuilder extends FullyComposedBuilder {
  compile() {
    return this.config;
  }
}

```

### Isolated Mixin Functions (Traits)

Each domain file exports a factory function that takes a base class, extends it inline, adds specific fluent methods, and returns it.

```typescript
// engine/fluent/agent/identity.ts
import { Constructor, BaseAgentBuilder } from '../base';

export function IdentityMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    withName(name: string) {
      this.config.name = name;
      return this; // Essential for chaining
    }

    withInstructions(instructions: string) {
      this.config.instructions = instructions;
      return this;
    }
  };
}
```