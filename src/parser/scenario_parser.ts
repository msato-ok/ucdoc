import { ParserContext, IAppProps } from './parser';
import { ParseError } from '../common';
import { Cache } from '../spec/cache';
import { UseCase, UseCaseId } from '../spec/usecase';
import { Scenario, ScenarioId } from '../spec/scenario';
import { Name, Summary } from '../spec/core';

export function parseScenarios(ctx: ParserContext, data: IAppProps, usecasesDic: Cache<UseCase>): Scenario[] {
  ctx.push(['scenarios']);
  const sescenarios: Scenario[] = [];
  if (data.scenarios) {
    for (const [id, scenario] of Object.entries(data.scenarios)) {
      ctx.push([id]);
      const usecases: UseCase[] = [];
      ctx.push(['usecaseOrder']);
      for (const usecaseId of scenario.usecaseOrder) {
        ctx.push([usecaseId]);
        const u = usecasesDic.get(new UseCaseId(usecaseId));
        if (!u) {
          throw new ParseError(`${usecaseId} は usecases の中に見つかりません`);
        }
        usecases.push(u);
        ctx.pop();
      }
      ctx.pop();
      const o = new Scenario(new ScenarioId(id), new Name(scenario.name), new Summary(scenario.summary), usecases);
      sescenarios.push(o);
      ctx.pop();
    }
  }
  ctx.pop();
  return sescenarios;
}
