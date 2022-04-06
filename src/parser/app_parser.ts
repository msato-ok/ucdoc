import { ParserContext, IAppProps } from './parser';
import { App } from '../spec/app';
import { Actor } from '../spec/actor';
import { Cache } from '../spec/cache';
import { Glossary, GlossaryCollection } from '../spec/glossary';
import { Factor } from '../spec/valiation';
import { UseCase } from '../spec/usecase';
import { Scenario } from '../spec/scenario';
import { parseGlossary } from './glossary_parser';
import { parseActor } from './actor_parser';
import { parseFactor } from './factor_parser';
import { parseUsecase } from './usecase_parser';
import { parseScenarios } from './scenario_parser';

export function parseApp(ctx: ParserContext, data: IAppProps, ucGlossaries?: Map<string, Set<Glossary>>): App {
  const actors: Actor[] = parseActor(ctx, data);
  const actorDic = new Cache<Actor>();
  actorDic.addAll(actors);

  const glossaries: GlossaryCollection = parseGlossary(ctx, data);
  const factors: Factor[] = parseFactor(ctx, data);
  const factorDic = new Cache<Factor>();
  factorDic.addAll(factors);

  const usecases: UseCase[] = parseUsecase(ctx, data, actorDic, factorDic, glossaries, ucGlossaries);
  const usecasesDic = new Cache<UseCase>();
  usecasesDic.addAll(usecases);

  const scenarios: Scenario[] = parseScenarios(ctx, data, usecasesDic);

  return new App(actors, usecases, scenarios, glossaries);
}
