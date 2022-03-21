import * as spec from './spec';
import yaml from 'js-yaml';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';

export interface SpecCommand {
  execute(spec: spec.App): void;
}

export class UcmdSpecCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(spc: spec.App): void {
    spc.usecases.forEach(uc => {
      this.writeUc(spc, uc);
    });
  }

  private writeUc(spc: spec.App, uc: spec.UseCase) {
    const data = {
      uc: uc,
      actors: uc.actors,
      frontMatter: yaml
        .dump({
          id: uc.id.toString,
          name: uc.name.text,
        })
        .trimEnd(),
    };
    const template = `
---
<%= frontMatter %>
---

# <%= uc.id.toString %> <%= uc.name.text %>

## 概要
<%= uc.summary.text %>

## 事前条件
<%_ uc.preConditions.forEach((condition) => { %>
- <%= condition.id.toString %>: <%= condition.description.text -%>
<% }); %>

## 事後条件
<%_ uc.postConditions.forEach((condition, id) => { %>
- <%= condition.id.toString %>: <%= condition.description.text -%>
<% }); %>

## アクター
<%_ uc.actors.forEach((actor) => { %>
- <%= actor.id.toString %>: <%= actor.name.text -%>
<% }); %>

## 基本フロー
<%_ uc.basicFlows.flows.forEach((flow) => { %>
- <%= flow.id.toString %>: <%= flow.description.text -%>
<% }); %>

## 代替フロー
<%_ uc.alternateFlows.flows.forEach((flow) => { %>
- <%= flow.id.toString %>: <%= flow.description.text %> （XREF: <%= flow.sourceFlows.map(x => "[" + x.id.toString + "][]").join(", ") %>）
    <%_ flow.nextFlows.flows.forEach((nextFlow) => { %>
    - <%= nextFlow.id.toString %>: <%= nextFlow.description.text -%>
    <% }); %>
    - [<%= flow.returnFlow.id.toString %>][] に戻る
<% }); %>

## 例外フロー
<%_ uc.exceptionFlows.flows.forEach((flow) => { %>
- <%= flow.id.toString %>: <%= flow.description.text %> （XREF: <%= flow.sourceFlows.map(x => "[" + x.id.toString + "][]").join(", ") %>）
    <%_ flow.nextFlows.flows.forEach((nextFlow) => { %>
    - <%= nextFlow.id.toString %>: <%= nextFlow.description.text -%>
    <% }); %>
    - 終了
<% }); %>
`;
    const mdtext = ejs.render(template.trimStart(), data, {});
    console.log(mdtext);
    const mdpath = path.join(this.output, `${uc.id.toString}.md`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
