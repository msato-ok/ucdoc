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

class Entity implements HasKey {
  constructor(readonly id: UniqueId) {}
  get key(): string {
    return this.id.toString;
  }
}

export interface HasKey {
  get key(): string;
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
export class Url extends HasText implements ValueObject {
  constructor(readonly text: string) {
    super(text);
  }
}

export class Cache<T extends HasKey> {
  private _cache: Map<string, T> = new Map<string, T>();

  get(key: string | UniqueId): T | undefined {
    if (key instanceof UniqueId) {
      return this._cache.get(key.id);
    }
    return this._cache.get(key);
  }

  add(obj: T) {
    if (this._cache.has(obj.key)) {
      throw new common.ValidationError(`actor(${obj.key}) はユニークにしてください`);
    }
    this._cache.set(obj.key, obj);
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
  private _actors: Cache<Actor> = new Cache<Actor>();
  private _usecases: Cache<UseCase> = new Cache<UseCase>();
  private _scenarios: Cache<Scenario> = new Cache<Scenario>();

  constructor(
    readonly actors: Actor[],
    readonly usecases: UseCase[],
    readonly scenarios: Scenario[],
    readonly glossaries: GlossaryCollection
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

  getUseCase(id: UseCaseId): UseCase | undefined {
    return this._usecases.get(id);
  }

  getGlossary(name: GlossaryId, category?: GlossaryCategory): Glossary | undefined {
    return this.glossaries.get(name, category);
  }
}

export class ActorId extends UniqueId {}

export class Actor extends Entity {
  constructor(readonly id: ActorId, readonly name: Name) {
    super(id);
  }
  get text(): string {
    return this.name.text;
  }
}

export class UseCaseId extends UniqueId {}

export class UseCase extends Entity {
  private _preConditions: Cache<PreCondition> = new Cache<PreCondition>();
  private _postConditions: Cache<PostCondition> = new Cache<PostCondition>();

  get actors(): Actor[] {
    const acts = new Set<Actor>();
    this.basicFlows.actors.forEach(a => {
      acts.add(a);
    });
    this.alternateFlows.actors.forEach(a => {
      acts.add(a);
    });
    this.exceptionFlows.actors.forEach(a => {
      acts.add(a);
    });
    return Array.from(acts);
  }

  get players(): Player[] {
    const players = new Set<Player>();
    this.basicFlows.players.forEach(o => {
      players.add(o);
    });
    this.alternateFlows.players.forEach(o => {
      players.add(o);
    });
    this.exceptionFlows.players.forEach(o => {
      players.add(o);
    });
    return Array.from(players);
  }

  constructor(
    readonly id: UseCaseId,
    readonly name: Name,
    readonly summary: Summary,
    readonly preConditions: PreCondition[],
    readonly postConditions: PostCondition[],
    readonly basicFlows: FlowCollection,
    readonly alternateFlows: AltExFlowCollection<AlternateFlow>,
    readonly exceptionFlows: AltExFlowCollection<ExceptionFlow>,
    readonly glossaries?: GlossaryCollection
  ) {
    super(id);
    this._preConditions.addAll(preConditions);
    this._postConditions.addAll(postConditions);
    this.validateFlowId();
    this.updateFlowsRef();
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

  private updateFlowsRef() {
    for (const flow of this.alternateFlows.flows) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
      flow.returnFlow.hasBackLink = true;
    }
    for (const flow of this.exceptionFlows.flows) {
      for (const srcFlow of flow.sourceFlows) {
        srcFlow.addRefFlow(flow);
      }
    }
  }
}

export class PrePostCondition extends Entity {
  constructor(readonly id: UniqueId, readonly description: Description) {
    super(id);
  }
}

export class PrePostConditionId extends UniqueId {}

export class PreCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}

export class PostCondition extends PrePostCondition {
  constructor(readonly id: PrePostConditionId, readonly description: Description) {
    super(id, description);
  }
}

export class FlowId extends UniqueId {}

export class Flow extends Entity {
  private _refFlows: Set<AbstractAltExFlow> = new Set<AbstractAltExFlow>();
  private _hasBackLink = false;

  get refFlows(): AbstractAltExFlow[] {
    return Array.from(this._refFlows);
  }

  get hasBackLink(): boolean {
    return this._hasBackLink;
  }

  set hasBackLink(b: boolean) {
    this._hasBackLink = b;
  }

  constructor(readonly id: FlowId, readonly description: Description, readonly player: Actor | Glossary) {
    super(id);
    if (!player) {
      throw new common.ValidationError(`flow(${id}) に player(${player}) は必須です。`);
    }
  }

  addRefFlow(flow: AbstractAltExFlow) {
    this._refFlows.add(flow);
    this.hasBackLink = true;
  }
}

export class FlowCollection {
  private _flows: Cache<Flow> = new Cache<Flow>();
  private _actors: Set<Actor> = new Set<Actor>();
  private _players: Set<Player> = new Set<Player>();

  get actors(): Actor[] {
    return Array.from(this._actors);
  }

  get players(): Player[] {
    return Array.from(this._players);
  }

  constructor(readonly flows: Flow[]) {
    this._flows.addAll(flows);
    for (const flow of flows) {
      if (flow.player instanceof Actor) {
        this._actors.add(flow.player);
      }
      this._players.add(flow.player);
    }
  }
}

export abstract class AbstractAltExFlow extends Entity {
  constructor(
    readonly id: AlternateFlowId | ExceptionFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection
  ) {
    super(id);
  }
}

export class AlternateFlowId extends UniqueId {}

export class AlternateFlow extends AbstractAltExFlow {
  constructor(
    readonly id: AlternateFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection,
    readonly returnFlow: Flow
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class ExceptionFlowId extends UniqueId {}

export class ExceptionFlow extends AbstractAltExFlow {
  constructor(
    readonly id: ExceptionFlowId,
    readonly description: Description,
    readonly sourceFlows: Flow[],
    readonly nextFlows: FlowCollection
  ) {
    super(id, description, sourceFlows, nextFlows);
  }
}

export class AltExFlowCollection<T extends AbstractAltExFlow> {
  private _flows: Cache<T> = new Cache<T>();
  private _actors: Set<Actor> = new Set<Actor>();
  private _players: Set<Player> = new Set<Player>();

  get actors(): Actor[] {
    return Array.from(this._actors);
  }

  get players(): Player[] {
    return Array.from(this._players);
  }

  constructor(readonly flows: T[]) {
    this._flows.addAll(flows);
    for (const flow of flows) {
      for (const actor of flow.nextFlows.actors) {
        this._actors.add(actor);
      }
      for (const player of flow.nextFlows.players) {
        this._players.add(player);
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
    readonly id: PictId,
    readonly sourceFlows: Flow[],
    readonly factors: PictFactor[],
    readonly constraint: PictConstraint,
    readonly flowChangePatterns: PictFlowChangePattern
  ) {
    super(id);
  }
}

export class PictFactor {
  constructor(readonly name: Name, readonly items: PictItem[]) {}
}

export class PictFlowChangePatternId extends UniqueId {}

export class PictFlowChangePattern extends Entity {
  constructor(readonly id: PictFlowChangePatternId, readonly conditions: PictFactor[], readonly nextFlow: Flow) {
    super(id);
  }
}

export class ScenarioId extends UniqueId {}

export class Scenario extends Entity {
  constructor(
    readonly id: ScenarioId,
    readonly name: Name,
    readonly summary: Summary,
    readonly usecaseOrders: UseCase[]
  ) {
    super(id);
  }
}

export class GlossaryId extends UniqueId {}

export class GlossaryCategory extends HasText implements ValueObject {
  get key(): string {
    return this.text;
  }

  constructor(readonly text: string) {
    super(text);
  }
}

export class Glossary extends Entity {
  get text(): string {
    if (this.desc) {
      return this.desc.text;
    }
    if (this.name) {
      return this.name.text;
    }
    return this.id.toString;
  }

  constructor(
    readonly id: GlossaryId,
    readonly category: GlossaryCategory,
    readonly name?: Name,
    readonly desc?: Description,
    readonly url?: Url
  ) {
    super(id);
    if (!this.name) {
      this.name = new Name(id.toString);
    }
    if (!desc) {
      this.desc = new Description(this.name.text);
    }
  }
}

export class GlossaryCollection {
  private _categorizedGlossaries: Map<string, Glossary[]> = new Map<string, Glossary[]>();
  private _glossaries: Cache<Glossary> = new Cache<Glossary>();

  get categories(): GlossaryCategory[] {
    return Array.from(this._categorizedGlossaries.keys()).map(x => new GlossaryCategory(x));
  }

  constructor(readonly items: Glossary[]) {
    this._glossaries.addAll(items);
    for (const g of items) {
      if (g.category) {
        let gs = this._categorizedGlossaries.get(g.category.key);
        if (!gs) {
          gs = [];
          this._categorizedGlossaries.set(g.category.key, gs);
        }
        gs.push(g);
      }
    }
  }

  get(name: GlossaryId, category?: GlossaryCategory): Glossary | undefined {
    const g = this._glossaries.get(name);
    if (!g) {
      return undefined;
    }
    if (category) {
      if (!g.category.equals(category)) {
        return undefined;
      }
    }
    return g;
  }

  byCategory(category: GlossaryCategory): Glossary[] {
    let gs: Glossary[] | undefined = this._categorizedGlossaries.get(category.key);
    if (!gs) {
      gs = [];
    }
    return gs;
  }
}

type Player = Actor | Glossary;

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
