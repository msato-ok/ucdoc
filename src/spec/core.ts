export abstract class UniqueId {
  constructor(readonly text: string) {}
  equals(id: UniqueId): boolean {
    const res = this.text == id.text ? true : false;
    return res;
  }
}

export class Entity implements HasKey {
  constructor(readonly id: UniqueId) {}
  get key(): string {
    return this.id.text;
  }
  equals(o: Entity): boolean {
    return o.id.equals(this.id);
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

export interface HasTestCover {
  get isTestCover(): boolean;
  set testCover(cover: boolean);
}

export function implementsHasTestCover(arg: any): arg is HasTestCover {
  return arg !== null && typeof arg === 'object' && typeof arg.isTestCover === 'boolean';
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

export function entityContains(arrays: Entity[], target: Entity): boolean {
  for (const a of arrays) {
    if (a.equals(target)) {
      return true;
    }
  }
  return false;
}
