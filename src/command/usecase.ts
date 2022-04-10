import { UseCase } from '../spec/usecase';
import yaml from 'js-yaml';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { App } from '../spec/app';
import { SpecCommand } from './base';

export class UsecaseCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(spc: App): void {
    spc.usecases.forEach(uc => {
      this.writeUc(spc, uc);
    });
  }

  private writeUc(app: App, uc: UseCase) {
    const basicFlowLines = [];
    const backLinks = new Set<string>();
    for (const flow of uc.basicFlows.items) {
      const line = {
        anchor: false,
        label: flow.id.text,
        desc: '',
        ref: '',
      };
      if (flow.hasBackLink) {
        line.anchor = true;
      }
      if (flow.refFlows.length > 0) {
        line.ref = ` （${flow.refFlows.map(x => '[' + x.id.text + '][]').join(', ')}）`;
      }
      line.desc = `[${flow.player.text}](#${flow.player.id.text}) は、${flow.description.text}`;
      basicFlowLines.push(line);

      if (flow.hasBackLink) {
        backLinks.add(flow.id.text);
      }
      for (const backLinkFlow of flow.refFlows) {
        backLinks.add(backLinkFlow.id.text);
      }
    }
    if (uc.glossaries) {
      for (const g of uc.glossaries?.items) {
        backLinks.add(g.id.text);
      }
    }
    const data = {
      uc: uc,
      app: app,
      frontMatter: yaml
        .dump({
          id: uc.id.text,
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

# <%= uc.id.text %> <%= uc.name.text %>

## 概要
<%= uc.summary.text %>

## 事前条件
<%_ uc.preConditions.forEach((condition) => { %>
- <%= condition.id.text %>: <%= condition.description.text -%>
<% }); %>

## 事後条件
<%_ uc.postConditions.forEach((condition, id) => { %>
- <%= condition.id.text %>: <%= condition.description.text -%>
  <%_ condition.details.forEach((detail, id) => { %>
    - <%= detail.id.text %>: <%= detail.description.text -%>
  <% }); %>
<% }); %>

## アクター
<%_ uc.actors.forEach((actor) => { %>
- <a name="<%= actor.id.text %>"><%= actor.id.text %></a>: <%= actor.name.text -%>
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
<%_ uc.alternateFlows.items.forEach((flow) => { %>
- <%= flow.id.text %>: <%= flow.description.text %> （REF: <%= flow.sourceFlows.map(x => "[" + x.id.text + "][]").join(", ") %>）
    <%_ flow.nextFlows.items.forEach((nextFlow) => { %>
    - <%= nextFlow.id.text %>: [<%= nextFlow.player.text %>](#<%= nextFlow.player.id.text %>) は、<%= nextFlow.description.text -%>
    <% }); %>
    - [<%= flow.returnFlow.id.text %>][] に戻る
<% }); %>

## 例外フロー
<%_ uc.exceptionFlows.items.forEach((flow) => { %>
- <%= flow.id.text %>: <%= flow.description.text %> （REF: <%= flow.sourceFlows.map(x => "[" + x.id.text + "][]").join(", ") %>）
    <%_ flow.nextFlows.items.forEach((nextFlow) => { %>
    - <%= nextFlow.id.text %>: [<%= nextFlow.player.text %>](#<%= nextFlow.player.id.text %>) は、<%= nextFlow.description.text -%>
    <% }); %>
    - 終了
<% }); %>

<%_ if (uc.glossaries) { %>
## 関連資料
  <%_ uc.glossaries.categories.forEach((cat) => { %>
- <%= cat.text %>
    <%_ uc.glossaries.byCategory(cat).forEach((glossary) => { %>
    - <a name="<%= glossary.id.text %>"><%= glossary.id.text %></a>: <%= glossary.text -%>
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
    const mdpath = path.join(this.output, `${uc.id.text}.md`);
    fs.writeFileSync(mdpath, mdtext);
    console.info(`${mdpath} generated.`);
  }
}
