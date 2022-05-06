import { UseCase } from '../spec/usecase';
import yaml from 'js-yaml';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { App } from '../spec/app';
import { AbstractSpecCommand } from './base';

export class UsecaseCommand extends AbstractSpecCommand {
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
        label: flow.id.text,
        desc: '',
        ref: '',
      };
      if (flow.refFlows.length > 0) {
        line.ref = ` （${flow.refFlows.map(x => x.id.text).join(', ')}）`;
      }
      line.desc = `${flow.player.text} は、${flow.description.text}`;
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
  <%_ condition.childNodes.forEach((detail, id) => { %>
    - <%= detail.id.text %>: <%= detail.description.text -%>
  <% }); %>
<% }); %>

## アクター
<%_ uc.actors.forEach((actor) => { %>
- <%= actor.id.text %>: <%= actor.name.text -%>
<% }); %>

## 基本フロー
<%_ basicFlowLines.forEach((line) => { -%>
- <%= line.label %>: <%= line.desc %><%= line.ref %>
<% }); -%>

## 代替フロー
<%_ uc.alternateFlows.items.forEach((altFlow) => { %>
- <%= altFlow.id.text %>: <%= altFlow.description.text %> （REF: <%= altFlow.refText %>）
    <%_ altFlow.overrideFlows.forEach((ov) => { %>
      <%_ ov.replaceFlows.items.forEach((replFlow) => { %>
    - <%= replFlow.id.text %>: <%= replFlow.player.text %> は、<%= replFlow.description.text -%>
      <% }); %>
    - <%= ov.returnFlow.id.text %> に戻る
    <% }); %>
<% }); %>

## 例外フロー
<%_ uc.exceptionFlows.items.forEach((exFlow) => { %>
- <%= exFlow.id.text %>: <%= exFlow.description.text %> （REF: <%= exFlow.refText %>）
    <%_ exFlow.overrideFlows.forEach((ov) => { %>
      <%_ ov.replaceFlows.items.forEach((replFlow) => { %>
    - <%= replFlow.id.text %>: <%= replFlow.player.text %> は、<%= replFlow.description.text -%>
      <% }); %>
    <% }); %>
    - 終了
<% }); %>

<%_ if (uc.glossaries) { %>
## 関連資料
  <%_ uc.glossaries.categories.forEach((cat) => { %>
- <%= cat.text %>
    <%_ uc.glossaries.byCategory(cat).forEach((glossary) => { %>
      <%_ if (glossary.id.text == glossary.text) { %>
    - <%= glossary.id.text %>
        <%_ } else { -%>
    - <%= glossary.id.text %>: <%= glossary.text -%>
      <%_ } -%>
    <% }); %>
  <% }); %>
<% } %>
`;
    const mdtext = ejs.render(template.trimStart(), data, {});
    const mdpath = path.join(this.option.output, `${uc.id.text}.md`);
    fs.writeFileSync(mdpath, mdtext);
    console.info(`${mdpath} generated.`);
  }
}
