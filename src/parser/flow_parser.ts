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
} from '../spec/flow';

export function parseBasicFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IFlowProps>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): Flow[] {
  const flows: Flow[] = [];
  if (!flowPropsArray) {
    return flows;
  }
  for (const [id, props] of Object.entries(flowPropsArray)) {
    ctx.push([id]);
    ctx.push(['playerId']);
    let player: Actor | Glossary | undefined = actorDic.get(new ActorId(props.playerId));
    if (!player) {
      player = glossaries.get(new GlossaryId(props.playerId));
    }
    if (!player) {
      throw new ParseError(
        `${props.playerId} は定義されていません。actors に追加するか、glossary に追加してください。`
      );
    }
    ctx.pop();
    const flow = new Flow(new FlowId(id), new Description(props.description), player);
    flows.push(flow);
    ctx.pop();
  }
  return flows;
}

export function parseAlternateFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IAlternateFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<AlternateFlow> {
  ctx.push(['alternateFlows']);
  const flows: AlternateFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push([id]);
      const sourceFlows: Flow[] = [];
      ctx.push(['sourceFlowIds']);
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          throw new ParseError(`${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      ctx.pop();
      ctx.push(['nextFlows']);
      const nextFlows = parseBasicFlows(ctx, props.nextFlows, actorDic, glossaries);
      ctx.pop();
      ctx.push(['returnFlow']);
      const returnFlow = basicFlowDic.get(new FlowId(props.returnFlowId));
      if (!returnFlow) {
        throw new ParseError(`${props.returnFlowId} は未定義です。`);
      }
      ctx.pop();
      const flow = new AlternateFlow(
        new AlternateFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows),
        returnFlow
      );
      flows.push(flow);
      ctx.pop();
    }
  }
  const collection = new AltExFlowCollection<AlternateFlow>(flows);
  ctx.pop();
  return collection;
}

export function parseExceptionFlows(
  ctx: ParserContext,
  flowPropsArray: Record<string, IExceptionFlowProps>,
  basicFlowDic: Cache<Flow>,
  actorDic: Cache<Actor>,
  glossaries: GlossaryCollection
): AltExFlowCollection<ExceptionFlow> {
  ctx.push(['exceptionFlows']);
  const flows: ExceptionFlow[] = [];
  if (flowPropsArray) {
    for (const [id, props] of Object.entries(flowPropsArray)) {
      ctx.push([id]);
      const sourceFlows: Flow[] = [];
      ctx.push(['sourceFlowIds']);
      for (const sourceFlowId of props.sourceFlowIds) {
        const flow = basicFlowDic.get(new FlowId(sourceFlowId));
        if (!flow) {
          throw new ParseError(`${sourceFlowId} は未定義です。`);
        }
        sourceFlows.push(flow);
      }
      ctx.pop();
      ctx.push(['nextFlows']);
      const nextFlows = parseBasicFlows(ctx, props.nextFlows, actorDic, glossaries);
      ctx.pop();
      const flow = new ExceptionFlow(
        new ExceptionFlowId(id),
        new Description(props.description),
        sourceFlows,
        new FlowCollection(nextFlows)
      );
      flows.push(flow);
      ctx.pop();
    }
  }
  ctx.pop();
  return new AltExFlowCollection<ExceptionFlow>(flows);
}
