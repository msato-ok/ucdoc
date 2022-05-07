import { ParserContext, IAppProps } from './parser';
import { Glossary, GlossaryId, GlossaryCollection, GlossaryCategory } from '../spec/glossary';
import { Description, Name, Url } from '../spec/core';

export function parseGlossary(ctx: ParserContext, data: IAppProps): GlossaryCollection {
  ctx.push('glossaries');
  const glossaries: Glossary[] = [];
  for (const [cat, glossariesByCat] of Object.entries(data.glossaries)) {
    for (const [id, props] of Object.entries(glossariesByCat)) {
      ctx.push(id);
      let o: Glossary;
      if (!props) {
        o = new Glossary(new GlossaryId(id), new GlossaryCategory(cat));
      } else {
        o = new Glossary(
          new GlossaryId(id),
          new GlossaryCategory(cat),
          props.name ? new Name(props.name) : undefined,
          props.desc ? new Description(props.desc) : undefined,
          props.url ? new Url(props.url) : undefined
        );
      }
      glossaries.push(o);
      ctx.pop(id);
    }
  }
  ctx.pop('glossaries');
  return new GlossaryCollection(glossaries);
}
