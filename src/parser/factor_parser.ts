import { ParserContext, IAppProps } from './parser';
import { Factor, FactorId, FactorItem } from '../spec/valiation';
import { Name } from '../spec/core';

export function parseFactor(ctx: ParserContext, data: IAppProps): Factor[] {
  const factors: Factor[] = [];
  ctx.push('factors');
  for (const [id, props] of Object.entries(data.factors)) {
    ctx.push(id);
    let name = id;
    if (props.name) {
      name = props.name;
    }
    const items = [];
    for (const item of props.items) {
      ctx.push(item);
      items.push(new FactorItem(item));
      ctx.pop(item);
    }
    const o = new Factor(new FactorId(id), new Name(name), items);
    factors.push(o);
    ctx.pop(id);
  }
  ctx.pop('factors');
  return factors;
}
