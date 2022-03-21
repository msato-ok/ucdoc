import * as common from './common';

abstract class UniqueId {
  constructor(readonly id: string) {}
  equals(id: UniqueId): boolean {
    return this.id == id.id;
  }
  get toString(): string {
    return this.id;
  }
}

class Entity {
  constructor(readonly id: UniqueId) {}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ValueObject {}

export abstract class HasText {
  constructor(readonly text: string) {}
  equals(o: HasText): boolean {
    return o.text === this.text;
  }
}

export class Name extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}
export class Summary extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}
export class Description extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class EntityCache<T extends Entity> {
  private _cache: Map<string, T> = new Map<string, T>();

  get(id: UniqueId): T | undefined {
    return this._cache.get(id.toString);
  }

  add(obj: T) {
    if (this._cache.has(obj.id.toString)) {
      throw new common.ValidationError(`actor(${obj.id}) はユニークにしてください`);
    }
    this._cache.set(obj.id.toString, obj);
  }

  addAll(objs: T[]) {
    for (const obj of objs) {
      this.add(obj);
    }
  }

  get size(): number {
    return this._cache.size;
  }
}

export class App {
  private _actors: EntityCache<Actor> = new EntityCache<Actor>();
  private _usecases: EntityCache<UseCase> = new EntityCache<UseCase>();
  private _scenarios: EntityCache<Scenario> = new EntityCache<Scenario>();

  constructor(
    public readonly actors: Actor[],
    public readonly usecases: UseCase[],
    public readonly scenarios: Scenario[],
    public readonly glossaries: Glossary[]
  ) {
    this._actors.addAll(actors);
    this._usecases.addAll(usecases);
    this._scenarios.addAll(scenarios);
    this.validate();
  }

  private validate() {
    // actors の必須チェック
    if (this._actors.size == 0) {
      throw new common.ValidationError('actors は1つ以上登録する必要があります');
    }
    // usecases の必須チェック
    if (this._usecases.size == 0) {
      throw new common.ValidationError('usecases は1つ以上登録する必要があります');
    }
  }

  getActor(id: ActorId): Actor | undefined {
    return this._actors.get(id);
  }

  getGlossary(name: GlossaryId, category?: GlossaryCategory): Glossary | undefined {
    for (const glossary of this.glossaries) {
      if (category && glossary.category) {
        if (!glossary.category.equals(category)) {
          continue;
        }
      }
      if (!glossary.name.equals(name)) {
        continue;
      }
      return glossary;
    }
    return undefined;
  }
}

export class ActorId extends UniqueId {}

export class Actor extends Entity {
  constructor(public readonly id: ActorId, public readonly name: Name) {
    super(id);
  }
}

export class UseCaseId extends UniqueId {}

export class UseCase extends Entity {
  private _preConditions: EntityCache<PreCondition> = new EntityCache<PreCondition>();
  private _postConditions: EntityCache<PostCondition> = new EntityCache<PostCondition>();

  get actors(): Actor[] {
    let acts: Actor[] = [];
    acts = acts.concat(this.basicFlows.actors);
    acts = acts.concat(this.alternateFlows.actors);
    acts = acts.concat(this.exceptionFlows.actors);
    return acts;
  }

  constructor(
    readonly id: UseCaseId,
    readonly name: Name,
    readonly summary: Summary,
    readonly preConditions: PreCondition[],
    readonly postConditions: PostCondition[],
    readonly basicFlows: FlowCollection,
    readonly alternateFlows: AltExFlowCollection<AlternateFlow>,
    readonly exceptionFlows: AltExFlowCollection<ExceptionFlow>
  ) {
    super(id);
    this._preConditions.addAll(preConditions);
    this._postConditions.addAll(postConditions);
    this.validateFlowId();
  }

  private validateFlowId() {
    const uniqueIds = new Set<UniqueId>();
    const _props = <Record<string, unknown>>(this as unknown);
    walkProps(_props, [], function (obj: Record<string, unknown>, path: string[], name: string, val: unknown): void {
      if (!(val instanceof FlowId) && !(val instanceof AlternateFlowId) && !(val instanceof ExceptionFlowId)) {
        return;
      }
      if (uniqueIds.has(val)) {
        throw new common.ValidationError(
          `usecase(${_props.id}) で、フローのIDが重複しています。(${val})\n` +
            'basicFlows, alternateFlows, exceptionFlows 内のキーは、usecase 内でユニークになるようにしてください。'
        );
      }
    });
  }
}

export class PrePostCondition extends Entity {
  constructor(public readonly id: UniqueId, public readonly description: Description) {
    super(id);
  }
}

export class PrePostConditionId extends UniqueId {}

export class PreCondition extends PrePostCondition {
  constructor(public readonly id: PrePostConditionId, public readonly description: Description) {
    super(id, description);
  }
}

export class PostCondition extends PrePostCondition {
  constructor(public readonly id: PrePostConditionId, public readonly description: Description) {
    super(id, description);
  }
}

export class FlowId extends UniqueId {}

export class Flow extends Entity {
  constructor(
    public readonly id: FlowId,
    public readonly description: Description,
    public readonly player: Actor | Glossary
  ) {
    super(id);
    if (!player) {
      throw new common.ValidationError(`flow(${id}) に player(${player}) は必須です。`);
    }
  }
}

export class FlowCollection {
  private _flows: EntityCache<Flow> = new EntityCache<Flow>();
  private _actors: Set<Actor> = new Set<Actor>();

  get actors(): Actor[] {
    return Object.values(this._actors) as Actor[];
  }

  constructor(public readonly flows: Flow[]) {
    this._flows.addAll(flows);
    for (const flow of flows) {
      if (flow.player instanceof Actor) {
        this._actors.add(flow.player);
      }
    }
  }
}

export abstract class AbstractAltExFlow extends Entity {
  constructor(
    public readonly id: AlternateFlowId | ExceptionFlowId,
    public readonly description: Description,
    public readonly sourceFlows: Flow[],
    public readonly nextFlows: FlowCollection
  ) {
    super(id);
  }
}

export class AlternateFlowId extends UniqueId {}

export class AlternateFlow extends AbstractAltExFlow {
  constructor(
    public readonly id: AlternateFlowId,
    public readonly description: Description,
    public readonly sourceFlows: Flow[],
    public readonly nextFlows: FlowCollection,
    public readonly returnFlow: Flow
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class ExceptionFlowId extends UniqueId {}

export class ExceptionFlow extends AbstractAltExFlow {
  constructor(
    public readonly id: ExceptionFlowId,
    public readonly description: Description,
    public readonly sourceFlows: Flow[],
    public readonly nextFlows: FlowCollection
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class AltExFlowCollection<T extends AbstractAltExFlow> {
  private _flows: EntityCache<T> = new EntityCache<T>();
  private _actors: Set<Actor> = new Set<Actor>();

  get actors(): Actor[] {
    return Object.values(this._actors) as Actor[];
  }

  constructor(readonly flows: T[]) {
    this._flows.addAll(flows);
    for (const flow of flows) {
      for (const actor of flow.nextFlows.actors) {
        this._actors.add(actor);
      }
    }
  }
}

export class PictId extends UniqueId {}

export class PictItem extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class PictConstraint extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class Pict extends Entity {
  constructor(
    public readonly id: PictId,
    public readonly sourceFlows: Flow[],
    public readonly factors: PictFactor[],
    public readonly constraint: PictConstraint,
    public readonly flowChangePatterns: PictFlowChangePattern
  ) {
    super(id);
  }
}

export class PictFactor {
  constructor(public readonly name: Name, public readonly items: PictItem[]) {}
}

export class PictFlowChangePatternId extends UniqueId {}

export class PictFlowChangePattern extends Entity {
  constructor(
    public readonly id: PictFlowChangePatternId,
    public readonly conditions: PictFactor[],
    public readonly nextFlow: Flow
  ) {
    super(id);
  }
}

export class ScenarioId extends UniqueId {}

export class Scenario extends Entity {
  constructor(
    public readonly id: ScenarioId,
    public readonly name: Name,
    public readonly summary: Summary,
    public readonly usecaseOrders: UseCase[]
  ) {
    super(id);
  }
}

export class GlossaryId extends UniqueId {}

export class GlossaryCategory extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class Glossary extends Entity {
  constructor(readonly name: GlossaryId, readonly category?: GlossaryCategory, readonly desc?: Description) {
    super(name);
    if (!desc) {
      this.desc = new Description(name.id);
    }
  }
  get text(): string {
    if (this.desc) {
      return this.desc.text;
    }
    return this.name.id;
  }
}

type WalkCallback = (obj: Record<string, unknown>, path: string[], name: string, val: unknown) => void;

export function walkProps(obj: Record<string, unknown>, path: string[], callback: WalkCallback) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      continue;
    }
    if (typeof value === 'function') {
      continue;
    }
    if (typeof value === 'object') {
      walkProps(<Record<string, unknown>>value, path.concat([key]), callback);
    }
    callback(obj, path, key, value);
  }
}
