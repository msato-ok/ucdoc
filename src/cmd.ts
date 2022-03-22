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

  private writeUc(app: spec.App, uc: spec.UseCase) {
    const basicFlowLines = [];
    const backLinks = new Set<string>();
    for (const flow of uc.basicFlows.flows) {
      const line = {
        anchor: false,
        label: flow.id.toString,
        desc: '',
        ref: '',
      };
      if (flow.hasBackLink) {
        line.anchor = true;
      }
      if (flow.refFlows.length > 0) {
        line.ref = ` （${flow.refFlows.map(x => '[' + x.id.toString + '][]').join(', ')}）`;
      }
      line.desc = `[${flow.player.text}](#${flow.player.id.toString}) は、${flow.description.text}`;
      basicFlowLines.push(line);

      if (flow.hasBackLink) {
        backLinks.add(flow.id.toString);
      }
      for (const backLinkFlow of flow.refFlows) {
        backLinks.add(backLinkFlow.id.toString);
      }
    }
    console.log({ backLinks: backLinks });
    const data = {
      uc: uc,
      app: app,
      frontMatter: yaml
        .dump({
          id: uc.id.toString,
          name: uc.name.text,
        })
        .trimEnd(),
      basicFlowLines: basicFlowLines,
      backLinks: backLinks,
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
- <a name="<%= actor.id.toString %>"><%= actor.id.toString %></a>: <%= actor.name.text -%>
<% }); %>

## 基本フロー
<%_ basicFlowLines.forEach((line) => { -%>
  <%_ if (line.anchor) { -%>
- <a name="<%= line.label %>"><%= line.label %></a>: <%= line.desc %><%= line.ref %>
  <%_ } else { -%>
- <%= line.label %>: <%= line.desc %><%= line.ref %>
  <%_ } -%>
<% }); -%>

## 代替フロー
<%_ uc.alternateFlows.flows.forEach((flow) => { %>
- <%= flow.id.toString %>: <%= flow.description.text %> （REF: <%= flow.sourceFlows.map(x => "[" + x.id.toString + "][]").join(", ") %>）
    <%_ flow.nextFlows.flows.forEach((nextFlow) => { %>
    - <%= nextFlow.id.toString %>: [<%= nextFlow.player.text %>](#<%= nextFlow.player.id.toString %>) は、<%= nextFlow.description.text -%>
    <% }); %>
    - [<%= flow.returnFlow.id.toString %>][] に戻る
<% }); %>

## 例外フロー
<%_ uc.exceptionFlows.flows.forEach((flow) => { %>
- <%= flow.id.toString %>: <%= flow.description.text %> （REF: <%= flow.sourceFlows.map(x => "[" + x.id.toString + "][]").join(", ") %>）
    <%_ flow.nextFlows.flows.forEach((nextFlow) => { %>
    - <%= nextFlow.id.toString %>: [<%= nextFlow.player.text %>](#<%= nextFlow.player.id.toString %>) は、<%= nextFlow.description.text -%>
    <% }); %>
    - 終了
<% }); %>

<%_ if (uc.glossaries) { %>
## 用語
  <%_ uc.glossaries.categories.forEach((cat) => { %>
- <%= cat.text %>
    <%_ uc.glossaries.byCategory(cat).forEach((glossary) => { %>
    - <a name="<%= glossary.name.toString %>"><%= glossary.name.toString %></a>: <%= glossary.text -%>
    <% }); %>
  <% }); %>
<% } %>

<%# リンク %>
<%_ backLinks.forEach((link) => { -%>
[<%= link %>]: #<%= link %>
<%_ }); -%>
%>
`;
    const mdtext = ejs.render(template.trimStart(), data, {});
    console.log(mdtext);
    const mdpath = path.join(this.output, `${uc.id.toString}.md`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
