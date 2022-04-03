import { UniqueId, HasText, ValueObject, Entity, Name, Description, Url } from './core';
import { Cache } from './cache';

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
