import { ParserContext, IAppProps } from './parser';
import { Actor, ActorId } from '../spec/actor';
import { Name } from '../spec/core';

export function parseActor(ctx: ParserContext, data: IAppProps): Actor[] {
  const actors: Actor[] = [];
  ctx.push('actors');
  for (const [id, props] of Object.entries(data.actors)) {
    ctx.push(id);
    const a = new Actor(new ActorId(id), new Name(props.name));
    actors.push(a);
    ctx.pop(id);
  }
  ctx.pop('actors');
  return actors;
}
