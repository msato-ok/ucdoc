import { ParserContext, IFlowProps, IAlternateFlowProps, IExceptionFlowProps } from './parser';
import { ParseError } from '../common';
import { Actor, ActorId } from '../spec/actor';
import { Cache } from '../spec/cache';
import { Glossary, GlossaryId, GlossaryCollection } from '../spec/glossary';
import { Description } from '../spec/core';
import {
  Flow,
  FlowId,
  AltExFlowCollection,
  AlternateFlow,
  AlternateFlowId,
  ExceptionFlow,
  ExceptionFlowId,
  FlowCollection,
  AlternateOverrideFlow,
  ExceptionOverrideFlow,
} from '../spec/flow';

export function parseBasicFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IFlowProps>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): FlowCollection {
  const flows: Flow[] = [];
  if (!flowPropsArray) {
    return new FlowCollection(flows);
  }
  for (const [id, props] of Object.entries(flowPropsArray)) {
    ctx.push(id);
    ctx.push('playerId');
    let player: Actor | Glossary | undefined = actorDic.get(new ActorId(props.playerId));
    if (!player) {
      player = glossaries.get(new GlossaryId(props.playerId));
    }
    if (!player) {
      throw new ParseError(
        `${props.playerId} は定義されていません。actors に追加するか、glossary に追加してください。`
      );
    }
    ctx.pop('playerId');
    const flow = new Flow(new FlowId(id), new Description(props.description), player);
    flows.push(flow);
    ctx.pop(id);
  }
  return new FlowCollection(flows);
}

export function parseAlternateFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IAlternateFlowProps>,
  basicFlows: FlowCollection,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<AlternateFlow> {
  const basicFlowDic = new Cache<Flow>();
  basicFlowDic.addAll(basicFlows.items);

  ctx.push('alternateFlows');
  const flows: AlternateFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push(id);
      ctx.push('override');
      const overrideFLows: AlternateOverrideFlow[] = [];
      for (const [basicId, overrideProps] of Object.entries(props.override)) {
        ctx.push(basicId);
        const basicFlow = basicFlowDic.get(basicId);
        if (!basicFlow) {
          throw new ParseError(`${basicId} は basicFlows の中にありません。`);
        }
        ctx.push('replaceFlows');
        const replaceFlows = parseBasicFlows(ctx, overrideProps.replaceFlows, actorDic, glossaries);
        ctx.pop('replaceFlows');
        ctx.push('returnFlow');
        const returnFlow = basicFlowDic.get(new FlowId(overrideProps.returnFlowId));
        if (!returnFlow) {
          throw new ParseError(`${overrideProps.returnFlowId} は basicFlows の中にありません。`);
        }
        const overrideFLow = new AlternateOverrideFlow(basicFlow, replaceFlows, returnFlow);
        overrideFLows.push(overrideFLow);
        ctx.pop('returnFlow');
        ctx.pop(basicId);
      }
      ctx.pop('override');
      const flow = new AlternateFlow(
        new AlternateFlowId(id),
        new Description(props.description),
        overrideFLows,
        basicFlows
      );
      flows.push(flow);
      ctx.pop(id);
    }
  }
  const collection = new AltExFlowCollection<AlternateFlow>(flows);
  ctx.pop('alternateFlows');
  return collection;
}

export function parseExceptionFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IExceptionFlowProps>,
  basicFlows: FlowCollection,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<ExceptionFlow> {
  const basicFlowDic = new Cache<Flow>();
  basicFlowDic.addAll(basicFlows.items);

  ctx.push('exceptionFlows');
  const flows: ExceptionFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push(id);
      ctx.push('override');
      const overrideFLows: ExceptionOverrideFlow[] = [];
      for (const [basicId, overrideProps] of Object.entries(props.override)) {
        ctx.push(basicId);
        const basicFlow = basicFlowDic.get(basicId);
        if (!basicFlow) {
          throw new ParseError(`${basicId} は basicFlows の中にありません。`);
        }
        ctx.push('replaceFlows');
        const replaceFlows = parseBasicFlows(ctx, overrideProps.replaceFlows, actorDic, glossaries);
        ctx.pop('replaceFlows');
        const overrideFLow = new ExceptionOverrideFlow(basicFlow, replaceFlows);
        overrideFLows.push(overrideFLow);
        ctx.pop(basicId);
      }
      ctx.pop('override');
      const flow = new ExceptionFlow(
        new ExceptionFlowId(id),
        new Description(props.description),
        overrideFLows,
        basicFlows
      );
      flows.push(flow);
      ctx.pop(id);
    }
  }
  ctx.pop('exceptionFlows');
  return new AltExFlowCollection<ExceptionFlow>(flows);
}
