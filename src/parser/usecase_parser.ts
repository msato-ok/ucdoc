import { ParserContext, IAppProps, IPrePostConditionProps } from './parser';
import { Actor } from '../spec/actor';
import { Cache } from '../spec/cache';
import { Glossary, GlossaryCollection } from '../spec/glossary';
import { Factor } from '../spec/valiation';
import { UseCase, UseCaseId } from '../spec/usecase';
import { Description, Name, Summary } from '../spec/core';
import { PreCondition, PostCondition, PrePostCondition, PrePostConditionId } from '../spec/prepostcondition';
import { AltExFlowCollection, AlternateFlow, ExceptionFlow } from '../spec/flow';
import { Valiation } from '../spec/valiation';
import { parseBasicFlows, parseAlternateFlows, parseExceptionFlows } from './flow_parser';
import { parseValiations } from './valiation_parser';
import { getNestedObjects } from '../spec/core';

export function parseUsecase(
  ctx: ParserContext,
  data: IAppProps,
  actorDic: Cache<Actor>,
  factorDic: Cache<Factor>,
  glossaries: GlossaryCollection,
  ucGlossaries?: Map<string, Set<Glossary>>,
  strictValidation?: boolean
): UseCase[] {
  if (strictValidation === undefined) {
    strictValidation = false;
  }

  ctx.push('usecases');
  const usecases: UseCase[] = [];
  for (const [id, props] of Object.entries(data.usecases)) {
    ctx.push(id);
    ctx.push('preConditions');
    const preConditions: PreCondition[] = parsePrePostCondition(PreCondition, ctx, props.preConditions);
    const preConditionDic = new Cache<PreCondition>();
    preConditionDic.addAll(getNestedObjects<PreCondition>(preConditions));
    ctx.pop('preConditions');

    ctx.push('postConditions');
    const postConditions: PostCondition[] = parsePrePostCondition(PostCondition, ctx, props.postConditions);
    const postConditionDic = new Cache<PostCondition>();
    postConditionDic.addAll(getNestedObjects<PostCondition>(postConditions));
    ctx.pop('postConditions');

    ctx.push('basicFlows');
    const basicFlows = parseBasicFlows(ctx, props.basicFlows, actorDic, glossaries);
    ctx.pop('basicFlows');

    const alternateFlows: AltExFlowCollection<AlternateFlow> = parseAlternateFlows(
      ctx,
      props.alternateFlows,
      basicFlows,
      actorDic,
      glossaries
    );
    const exceptionFlows: AltExFlowCollection<ExceptionFlow> = parseExceptionFlows(
      ctx,
      props.exceptionFlows,
      basicFlows,
      actorDic,
      glossaries
    );

    let glossariesInUc = undefined;
    if (ucGlossaries) {
      const gset = ucGlossaries.get(id);
      if (gset) {
        glossariesInUc = new GlossaryCollection(Array.from(gset));
      }
    }

    const valiations: Valiation[] = parseValiations(
      ctx,
      props.valiations,
      preConditionDic,
      postConditionDic,
      basicFlows,
      alternateFlows,
      exceptionFlows,
      factorDic,
      strictValidation
    );

    const usecase = new UseCase(
      new UseCaseId(id),
      new Name(props.name),
      new Summary(props.summary),
      preConditions,
      postConditions,
      basicFlows,
      alternateFlows,
      exceptionFlows,
      valiations,
      glossariesInUc,
      strictValidation
    );
    if (!strictValidation && usecase.hasError) {
      console.warn(`WARN: ${ctx.pathText}: \n${usecase.errors.map(x => `  - ${x}`).join('\n')}`);
    }

    usecases.push(usecase);
    ctx.pop(id);
  }
  ctx.pop('usecases');
  return usecases;
}

/*
 * ■ ctor について補足
 * generics で new したい (`a = new T(id, desc);`) ときの HACK である。
 * https://qiita.com/ConquestArrow/items/ace6d926b7e89b8f92d9
 */
function parsePrePostCondition<T extends PrePostCondition>(
  ctor: { new (id: PrePostConditionId, desc: Description): T },
  ctx: ParserContext,
  conditionsProps: Record<string, IPrePostConditionProps>
): T[] {
  const conditions: T[] = [];
  for (const [id, props] of Object.entries(conditionsProps)) {
    let desc: string;
    if (typeof props === 'string') {
      desc = props;
    } else {
      desc = props.description;
    }
    const cond = new ctor(new PrePostConditionId(id), new Description(desc));
    if (props.details) {
      ctx.push('details');
      const details = parsePrePostCondition(ctor, ctx, props.details);
      for (const detail of details) {
        cond.addDetail(detail);
      }
      ctx.pop('details');
    }
    conditions.push(cond);
  }
  return conditions;
}
