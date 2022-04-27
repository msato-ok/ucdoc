import { ParserContext, IValiationProps, IValiationResultProps } from './parser';
import { ParseError } from '../common';
import { Cache } from '../spec/cache';
import { Description } from '../spec/core';
import { PreCondition, PrePostConditionId, PostCondition } from '../spec/prepostcondition';
import { Flow, FlowId, AltExFlowCollection, AlternateFlow, ExceptionFlow, FlowCollection } from '../spec/flow';
import {
  Valiation,
  ValiationId,
  PictConstraint,
  ValiationResult,
  ValiationResultId,
  PictCombiFactory,
  Factor,
  FactorId,
  FactorItem,
  FactorItemChoice,
  FactorItemChoiceCollection,
  CheckPoint,
} from '../spec/valiation';

export function parseValiations(
  ctx: ParserContext,
  valiationPropsArray: Record<string, IValiationProps>,
  preConditionDic: Cache<PreCondition>,
  postConditionDic: Cache<PostCondition>,
  basicFlows: FlowCollection,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorDic: Cache<Factor>,
  strictValidation: boolean
): Valiation[] {
  const basicFlowDic = new Cache<Flow>();
  basicFlowDic.addAll(basicFlows.items);

  ctx.push('valiations');
  const valiations: Valiation[] = [];
  if (valiationPropsArray) {
    for (const [id, props] of Object.entries(valiationPropsArray)) {
      ctx.push(id);
      const sourceFlows: Flow[] = [];
      const sourcePreConds: PreCondition[] = [];
      ctx.push('injectIds');
      for (const injectId of props.injectIds) {
        ctx.push(injectId);
        const cond = preConditionDic.get(new PrePostConditionId(injectId));
        const flow = basicFlowDic.get(new FlowId(injectId));
        if (cond) {
          sourcePreConds.push(cond);
        } else if (flow) {
          sourceFlows.push(flow);
        } else {
          throw new ParseError('preConditions および basicFlows に未定義です。');
        }
        ctx.pop(injectId);
      }
      if (sourcePreConds.length == 0 && sourceFlows.length == 0) {
        throw new ParseError('injectIds が未定義です。');
      }
      ctx.pop('injectIds');
      const factors = [];
      const factorInValiation = new Cache<Factor>();
      ctx.push('factorIds');
      for (const factorId of props.factorIds) {
        ctx.push(factorId);
        const factor = factorDic.get(new FactorId(factorId));
        if (!factor) {
          throw new ParseError(`${factorId} は factors に未定義です。`);
        }
        factors.push(factor);
        factorInValiation.add(factor);
        ctx.pop(factorId);
      }
      ctx.pop('factorIds');
      const results = [];
      ctx.push('results');
      for (const [resultId, resultProps] of Object.entries(props.results)) {
        const vr = parseValiationResult(
          ctx,
          resultId,
          resultProps,
          postConditionDic,
          alternateFlows,
          exceptionFlows,
          factorInValiation
        );
        results.push(vr);
      }
      ctx.pop('results');
      const pictCombi = PictCombiFactory.getInstance(factors);
      const valiation = new Valiation(
        new ValiationId(id),
        sourceFlows,
        factors,
        new PictConstraint(props.pictConstraint),
        pictCombi,
        results,
        strictValidation
      );
      if (!strictValidation && valiation.invalidRules.length > 0) {
        const errmsg = [
          `${valiation.invalidRules.join('\n')}`,
          '※ ruleNoはデシジョンテーブルのmdを作成して確認してください。',
          'usage: ucdoc decision <file> [otherFiles...]',
        ].join('\n');
        console.warn(`WARN: ${ctx.pathText}: ${errmsg}`);
      }
      valiations.push(valiation);
      ctx.pop(id);
    }
  }
  ctx.pop('valiations');
  return valiations;
}

function parseValiationResult(
  ctx: ParserContext,
  resultId: string,
  resultProps: IValiationResultProps,
  postConditionDic: Cache<PostCondition>,
  alternateFlows: AltExFlowCollection<AlternateFlow>,
  exceptionFlows: AltExFlowCollection<ExceptionFlow>,
  factorInValiation: Cache<Factor>
): ValiationResult {
  ctx.push(resultId);
  const choices = new FactorItemChoiceCollection();
  for (const factor of factorInValiation.values()) {
    choices.addAll(factor);
  }
  ctx.push('arrow');
  let arrows;
  if (resultProps.arrow) {
    arrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.arrow);
  } else {
    arrows = choices.copy();
  }
  ctx.pop('arrow');
  ctx.push('disarrow');
  let disarrows;
  if (resultProps.disarrow) {
    disarrows = parseFactorItemChoiceCollection(ctx, factorInValiation, resultProps.disarrow);
  } else {
    disarrows = new FactorItemChoiceCollection();
  }
  ctx.pop('disarrow');
  const order = resultProps.order ? resultProps.order : 'arrow';
  if (order == 'arrow') {
    ctx.push('arrow');
    choices.arrow(arrows);
    ctx.pop('arrow');
    ctx.push('disarrow');
    choices.disarrow(disarrows);
    ctx.pop('disarrow');
  } else {
    ctx.push('disarrow');
    choices.disarrow(disarrows);
    ctx.pop('disarrow');
    ctx.push('arrow');
    choices.arrow(arrows);
    ctx.pop('arrow');
  }
  ctx.push('checkIds');
  if (!resultProps.checkIds) {
    throw new ParseError('checkIds の定義は必須です。');
  }
  const checkPoints: CheckPoint[] = [];
  for (const id of resultProps.checkIds) {
    let checkPoint: CheckPoint | undefined = postConditionDic.get(id);
    if (!checkPoint) {
      checkPoint = alternateFlows.get(id);
    }
    if (!checkPoint) {
      checkPoint = exceptionFlows.get(id);
    }
    if (!checkPoint) {
      throw new ParseError(`${id} は postConditions, alternateFlows, exceptionFlows に未定義です。`);
    }
    checkPoints.push(checkPoint);
  }
  ctx.pop('checkIds');
  const results = new ValiationResult(
    new ValiationResultId(resultId),
    new Description(resultProps.desc),
    choices,
    checkPoints
  );
  ctx.pop(resultId);
  return results;
}

function parseFactorItemChoiceCollection(
  ctx: ParserContext,
  factorInValiation: Cache<Factor>,
  ad?: { [key: string]: string[] }
): FactorItemChoiceCollection {
  const adChoices = new FactorItemChoiceCollection();
  if (!ad) {
    return adChoices;
  }
  for (const [factorId, factorItems] of Object.entries(ad)) {
    ctx.push(factorId);
    const factor = factorInValiation.get(factorId);
    if (!factor) {
      throw new ParseError(`${factorId} は factorIds の中で未定義です。`);
    }
    for (const item of factorItems) {
      ctx.push(item);
      const itemObj = new FactorItem(item);
      if (!factor.existsItem(itemObj)) {
        throw new ParseError(`${item} は factors/${factorId}/items の中で未定義です。`);
      }
      const choice = new FactorItemChoice(factor, itemObj);
      adChoices.add(choice);
      ctx.pop(item);
    }
    ctx.pop(factorId);
  }
  return adChoices;
}
