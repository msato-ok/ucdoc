import { HasKey, UniqueId } from './core';
import * as common from '../common';

export class Cache<T extends HasKey> {
  private _cache: Map<string, T> = new Map<string, T>();

  get(key: string | UniqueId): T | undefined {
    if (key instanceof UniqueId) {
      return this._cache.get(key.text);
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

  values(): T[] {
    return Array.from(this._cache.values());
  }
}
