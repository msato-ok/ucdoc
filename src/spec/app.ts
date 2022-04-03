import { ValidationError } from '../common';
import { Cache } from './cache';
import { Actor, ActorId } from './actor';
import { UseCase, UseCaseId } from './usecase';
import { GlossaryCollection, Glossary, GlossaryId, GlossaryCategory } from './glossary';
import { Scenario } from './scenario';

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
      throw new ValidationError('actors は1つ以上登録する必要があります');
    }
    // usecases の必須チェック
    if (this._usecases.size == 0) {
      throw new ValidationError('usecases は1つ以上登録する必要があります');
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
