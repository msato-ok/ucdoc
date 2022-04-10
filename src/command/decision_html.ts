import { App } from '../spec/app';
import { SpecCommand } from './base';
import { UseCase } from '../spec/usecase';
import { Valiation, DTConditionRuleChoice, DTResultRuleChoice, DecisionTable } from '../spec/valiation';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';

// uctest.ts の 「■ html属性に関する注意」参照

interface IDTRow {
  dt_title: string; // 条件 or 結果
  factor_or_result: string; // 条件の項目名 or 結果の確認内容
  factor_item: string; // 条件の選択肢
  choice: string[]; // ルールの選択(Y or N or SP) or 結果の選択 (X or SP)
}

class DTSection {
  private _rows: IDTRow[] = [];

  constructor(dt: DecisionTable) {
    this.init(dt);
  }

  get rows(): IDTRow[] {
    return this._rows;
  }

  private init(dt: DecisionTable) {
    let condTitleOut = false;
    let prevFactorTitle = '';
    for (const conditionRow of dt.conditionRows) {
      const itemRow: IDTRow = {
        dt_title: '',
        factor_or_result: '',
        factor_item: conditionRow.item.text,
        choice: [],
      };
      if (!condTitleOut) {
        itemRow.dt_title = '条件';
        condTitleOut = true;
      }
      if (prevFactorTitle != conditionRow.factor.id.text) {
        itemRow.factor_or_result = conditionRow.factor.id.text;
      }
      prevFactorTitle = conditionRow.factor.id.text;
      for (const rule of conditionRow.rules) {
        if (rule == DTConditionRuleChoice.Yes) {
          itemRow.choice.push('Y');
        } else if (rule == DTConditionRuleChoice.No) {
          itemRow.choice.push('N');
        } else if (rule == DTConditionRuleChoice.None) {
          itemRow.choice.push(' ');
        } else {
          throw new Error(`not implement: ${rule}`);
        }
      }
      this._rows.push(itemRow);
    }
    let resTitleOut = false;
    for (const resultRow of dt.resultRows) {
      const itemRow: IDTRow = {
        dt_title: '',
        factor_or_result: resultRow.desc.text,
        factor_item: '',
        choice: [],
      };
      if (!resTitleOut) {
        itemRow.dt_title = '結果';
        resTitleOut = true;
      }
      for (const rule of resultRow.rules) {
        if (rule == DTResultRuleChoice.Check) {
          itemRow.choice.push('X');
        } else if (rule == DTResultRuleChoice.None) {
          itemRow.choice.push(' ');
        } else {
          throw new Error(`not implement: ${rule}`);
        }
      }
      this._rows.push(itemRow);
    }
  }
}

export class DecisionHtmlCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(spc: App): void {
    spc.usecases.forEach(uc => {
      for (const valiation of uc.valiations) {
        const data = this.assembleData(valiation, uc);
        this.write(`${uc.id.text}-${valiation.id.text}`, data);
      }
    });
  }

  private assembleData(valiation: Valiation, uc: UseCase): string {
    const dt = valiation.decisionTable;
    const dtSection = new DTSection(dt);
    function vueTableItem(items: Record<string, any>[]) {
      const data: Record<string, any>[] = [];
      for (const item of items) {
        const datum: Record<string, any> = {};
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        for (const key of Object.keys(item)) {
          datum[key] = item[key];
        }
        for (let i = 0; i < dt.countOfRules; i++) {
          const key = `choice_${i + 1}`;
          datum[key] = item['choice'][i];
        }
        data.push(datum);
      }
      return data;
    }
    return JSON.stringify({
      dt: {
        countOfRules: dt.countOfRules,
        items: vueTableItem(dtSection.rows),
      },
      uc: uc,
    });
  }

  private write(prefix: string, jsondata: string) {
    const template = `
<!DOCTYPE html>
<html>

<head>
  <link href="https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/vuetify@2.x/dist/vuetify.min.css" rel="stylesheet">
  <link href="https://use.fontawesome.com/releases/v5.0.13/css/all.css" rel="stylesheet">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">
  <style>
    /* テストシナリオフローの表に縦線を入れる */
    .app-vert-stripes table td,
    .app-vert-stripes table th {
      border-left: thin solid rgba(0, 0, 0, .12);
      /* 横線を消す */
      /*border-bottom: none;*/
    }
    /* 表の外枠線を描く */
    .app-vert-stripes table {
      border-top: thin solid rgba(0, 0, 0, .12);
      border-bottom: thin solid rgba(0, 0, 0, .12);
      border-right: thin solid rgba(0, 0, 0, .12);
    }
    /* テスト手順の表の偶数列をグレーにする */
    .theme--light.v-data-table.v-data-table--fixed-header thead th.app-rule.app-odd,
    .app-vert-stripes .app-rule.app-odd {
      background-color: #eee;
    }

    .theme--light.v-data-table.v-data-table--fixed-header thead th.app-rule.app-rule-selected,
    .app-vert-stripes td.app-rule-selected,
    .app-vert-stripes td.app-rule.app-odd.app-rule-selected {
      color: red;
      font-weight: bold;
      background-color: rgb(248, 233, 247);
    }
  </style>
</head>

<body>
  <div id="app">
    <!-- https://vuetifyjs.com/ja/introduction/why-vuetify/ -->
    <v-app>
      <v-container fluid>
        <v-row class="app_toolbar__wrapper">
          <v-toolbar class="mb-2" color="indigo" dark flat>
            <v-toolbar-title>デシジョンテーブル</v-toolbar-title>
          </v-toolbar>
        </v-row>
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-text>
                <v-data-table dense :items="app.dt.items" :disable-sort="true" class="app-vert-stripes" fixed-header
                  disable-pagination hide-default-footer>

                  <template v-slot:header>
                    <thead>
                      <tr>
                        <th colspan="3"></th>
                        <th
                          class="app-rule"
                          :class="[
                            ruleNo%2==1 ? 'app-odd': 'app-even',
                            ruleNo == (selectedRuleIndex+1) ? 'app-rule-selected': '',
                          ]"
                          v-for="ruleNo of app.dt.countOfRules"
                          >{{ ruleNo }}</th>
                      </tr>
                    </thead>
                  </template>
                  <template v-slot:body="{ items }">
                    <tbody>
                      <tr v-for="(item, rowIndex) in items" :key="rowIndex">
                        <td>{{ item.dt_title }}</td>
                        <td
                          :colspan="item.factor_item != '' ? '1': '2'"
                          :class="[
                            selectedFactorRowIndexs.includes(rowIndex) ? 'app-rule-selected': '',
                          ]"
                          >{{ item.factor_or_result }}</td>
                        <td
                          :class="[
                            selectedItemRowIndexs.includes(rowIndex) ? 'app-rule-selected': '',
                          ]"
                          v-if="item.factor_item != ''"
                          >{{ item.factor_item }}</td>
                        <td
                          class="app-rule"
                          :class="[
                            i%2==0 ? 'app-odd': 'app-even',
                            i == selectedRuleIndex ? 'app-rule-selected': '',
                          ]"
                          v-for="(choice, i) in item.choice"
                          v-on:mouseover="onRule(i, rowIndex)"
                          v-on:mouseleave="onRule(-1, rowIndex)"
                          >{{ choice }}</td>
                      </tr>
                    </tbody>
                  </template>

                </v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-app>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/vue@2.x/dist/vue.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vuetify@2.x/dist/vuetify.js"></script>
  <script>
    new Vue({
      el: '#app',
      vuetify: new Vuetify({
        icons: {
          iconfont: 'fa',
        },
      }),
      mounted() {
      },
      unmounted() {
      },
      methods: {
        onRule(index, rowIndex) {
          this.selectedRuleIndex = index;
          var factorRowIndexs = [];
          var itemRowIndexs = [];
          if (index >= 0) {
            var items = this.app.dt.items;
            items.forEach((item, rowIndex) => {
              item.choice.forEach((c, colIndex) => {
                if (colIndex == index && (c == 'Y' || c == 'X')) {
                  itemRowIndexs.push(rowIndex);
                  var factorIndex = rowIndex;
                  for (; factorIndex >= 0; factorIndex--) {
                    if (items[factorIndex].factor_or_result.length > 0) {
                      break;
                    }
                  }
                  factorRowIndexs.push(factorIndex);
                }
              });
            });
          }
          this.selectedFactorRowIndexs = factorRowIndexs;
          this.selectedItemRowIndexs = itemRowIndexs;
        },
      },
      data() {
        return {
          selectedRuleIndex: -1,
          selectedFactorRowIndexs: [],
          selectedItemRowIndexs: [],
          app: <%- data %>,
        };
      },
    })
  </script>
</body>

</html>
%>
`;
    const mdtext = ejs.render(template.trimStart(), { data: jsondata }, {});
    const mdpath = path.join(this.output, `${prefix}.html`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
