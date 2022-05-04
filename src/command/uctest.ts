import { App } from '../spec/app';
import { AbstractSpecCommand } from './base';
import { InvalidArgumentError } from '../common';
import { entityContains } from '../spec/core';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { UseCase } from '../spec/usecase';
import { UcScenarioDecisionTable, UcScenarioDecisionTableFactory } from '../spec/ucstep';
import {
  UcScenarioCollectionFactory,
  UcScenarioCollection,
  UcScenario,
  UcScenarioType,
  BranchType,
} from '../spec/uc_scenario';
import { AlternateFlow, ExceptionFlow } from '../spec/flow';
import { Valiation, DTConditionRuleChoice, DTResultRuleChoice, DecisionTable } from '../spec/valiation';

// ■ html属性に関する注意
//
// html のタグの属性名が小文字になっていることから、ブラウザは、タグの属性を小文字しか認識しない
// https://github.com/vuejs/vue/issues/9528#issuecomment-718400487
// そのため vue.js のカスマムタグも、キャメルケースじゃなくて、すべて小文字にする必要がある。
// 例えば、このようなタグで、 item.calories が属性として使われる。
//   <template v-slot:item.caloryValue="{ item }">
//     <v-chip
//       :color="getColor(item.caloryValue)"
//       dark
//     >
//       {{ item.calories }}
//     </v-chip>
//   </template>
// この例では、item.caloryValue に template が反応しないが、calory_value に変えると機能する。
// とてもハマりやすい。どのデータがタグ上の属性として使われるかは、実装しながら変わるので、
// html に出現するアイテムは、すべて小文字で実装する。

interface IScenario {
  scenario_id: string;
  scenario_type: string;
  desc: string;
}

interface IPlayer {
  player_id: string;
  desc: string;
}

interface IPreCondition {
  pre_condition_id: string;
  desc: string;
}

interface IPostCondition {
  post_condition_id: string;
  desc: string;
}

interface IScenarioFlow {
  flow_id: string;
  on_scenario: string[];
  player_id: string;
  desc: string;
  tooltips: string;
  branch_type: string;
}

interface IScenarioDTable {
  scenario_id: string;
  countOfRules: number;
  items: IStep[];
}

interface IStep {
  step_id: string;
  operation_desc: string;
  factor_desc: string;
  factor_select_item: string;
  factor_select_rules: string[];
}

class ScenarioFlowSection {
  private _scenarioFlows: IScenarioFlow[] = [];

  get scenarioFlows(): IScenarioFlow[] {
    return this._scenarioFlows;
  }

  constructor(private ucAllScenario: UcScenarioCollection, private uc: UseCase) {
    this.init();
  }

  private scenarioColums(flowOnScenarios: UcScenario[]): string[] {
    const cols = [];
    for (const horzScenario of this.ucAllScenario.scenarios) {
      if (entityContains(flowOnScenarios, horzScenario)) {
        cols.push('○');
      } else {
        cols.push(' ');
      }
    }
    return cols;
  }

  private init() {
    let branchFlow: AlternateFlow | ExceptionFlow | undefined = undefined;
    for (const flow of this.ucAllScenario.flows) {
      let tooltips = '';
      const branchType = this.ucAllScenario.getBranchType(flow);
      if (branchType == BranchType.Branch) {
        tooltips = '基本フローの分岐点';
      } else if (branchType == BranchType.Alternate) {
        const parent = this.uc.getAltExFlowByChildFlow(flow);
        if (!parent) {
          throw new InvalidArgumentError('BranchType.Alternate で代替フローの親を持たないフローはバグ');
        }
        if (branchFlow != parent) {
          tooltips = `代替フロー${parent.id.text}に分岐（${parent.description.text}）`;
          branchFlow = parent;
        }
      } else if (branchType == BranchType.Exception) {
        const parent = this.uc.getAltExFlowByChildFlow(flow);
        if (!parent) {
          throw new InvalidArgumentError('BranchType.Exception で例外フローの親を持たないフローはバグ');
        }
        if (branchFlow != parent) {
          tooltips = `例外フロー${parent.id.text}に分岐（${parent.description.text}）`;
          branchFlow = parent;
        }
      } else if (branchType == BranchType.None) {
        tooltips = '';
      } else {
        throw new InvalidArgumentError(`unknown branchType: ${branchType}`);
      }
      this._scenarioFlows.push({
        flow_id: flow.id.text,
        on_scenario: this.scenarioColums(this.ucAllScenario.getScenariosByFLow(flow)),
        player_id: flow.player.id.text,
        desc: flow.description.text,
        tooltips: tooltips,
        branch_type: branchType,
      });
    }
  }
}

function genScenarioDTables(ucAllScenario: UcScenarioCollection, uc: UseCase): IScenarioDTable[] {
  const ucDtJsons: IScenarioDTable[] = [];
  for (const ucScenario of ucAllScenario.scenarios) {
    for (const valiation of uc.valiations) {
      const ucDt = UcScenarioDecisionTableFactory.getInstance(ucScenario, valiation, uc.preConditions);
      const ucDtJson = {
        scenario_id: ucScenario.id.text,
        countOfRules: ucDt.countOfRules,
        items: [],
      } as IScenarioDTable;
      const prevJson = {
        operation_desc: '',
        factor_desc: '',
        factor_select_item: '',
      };
      for (const step of ucDt.steps) {
        const stepJson = {
          step_id: step.id.text,
          operation_desc: step.entryPoint.description.text,
          factor_desc: '',
          factor_select_item: '',
          factor_select_rules: Array(ucDt.countOfRules).fill(' '),
        } as IStep;
        if (step.conditionRow) {
          stepJson.factor_desc = step.conditionRow.factor.name.text;
          stepJson.factor_select_item = step.conditionRow.item.text;
          stepJson.factor_select_rules = step.conditionRow.rules.map(x =>
            x == DTConditionRuleChoice.Yes ? 'Y' : x == DTConditionRuleChoice.No ? 'N' : ' '
          );
        }
        if (prevJson.operation_desc == stepJson.operation_desc) {
          stepJson.operation_desc = '';
        } else {
          prevJson.operation_desc = stepJson.operation_desc;
        }
        if (prevJson.factor_desc == stepJson.factor_desc) {
          stepJson.factor_desc = '';
        } else {
          prevJson.factor_desc = stepJson.factor_desc;
        }
        ucDtJson.items.push(stepJson);
      }
      ucDtJsons.push(ucDtJson);
    }
  }
  return ucDtJsons;
}

export class UsecaseTestCommand extends AbstractSpecCommand {
  public execute(app: App): void {
    app.usecases.forEach(uc => {
      const ucScenarioCollection = UcScenarioCollectionFactory.getInstance(uc);
      const data = this.assembleData(ucScenarioCollection, uc);
      this.write(uc.id.text, data);
    });
  }

  private assembleData(ucAllScenario: UcScenarioCollection, uc: UseCase): string {
    const scenarios: IScenario[] = [];
    for (const o of ucAllScenario.scenarios) {
      const scenarioType =
        o.ucScenarioType == UcScenarioType.BasicFlowScenario
          ? '基本フローの検証'
          : o.ucScenarioType == UcScenarioType.AlternateFlowScenario
          ? '代替フローの検証'
          : o.ucScenarioType == UcScenarioType.ExceptionFlowScenario
          ? '例外フローの検証'
          : '不明';
      scenarios.push({
        scenario_id: o.id.text,
        scenario_type: scenarioType,
        desc: o.description.text,
      });
    }
    const players: IPlayer[] = [];
    for (const o of uc.actors) {
      players.push({
        player_id: o.id.text,
        desc: o.name.text,
      });
    }
    const preConditions: IPreCondition[] = [];
    for (const o of uc.preConditions) {
      preConditions.push({
        pre_condition_id: o.id.text,
        desc: o.description.text,
      });
    }
    const postConditions: IPostCondition[] = [];
    for (const o of uc.postConditions) {
      postConditions.push({
        post_condition_id: o.id.text,
        desc: o.description.text,
      });
    }
    const scenarioIds = ucAllScenario.scenarios.map(x => x.id.text);
    const scenarioFlowSection = new ScenarioFlowSection(ucAllScenario, uc);
    const scenarioFlows: IScenarioFlow[] = scenarioFlowSection.scenarioFlows;
    const scenarioDts = genScenarioDTables(ucAllScenario, uc);
    // v-data-table のデータは、headers に無くて、items にだけあるプロパティは、
    // 表にはレンダリングされないので、表出対象以外のデータのヘッダーは null にしておいて
    // ヘッダー構成に出力しないようにする。
    const headerText: Record<string, string | null> = {
      scenario_id: 'シナリオID',
      scenario_type: 'シナリオタイプ',
      desc: '説明',
      player_id: 'Player ID',
      pre_condition_id: 'ID',
      post_condition_id: 'ID',
      flow_id: 'フローID',
      on_scenario: null,
      tooltips: null,
    };
    function vueTableHeader(item: any) {
      const data = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      for (const key of Object.keys(item)) {
        if (headerText[key] === null) {
          continue;
        }
        if (!headerText[key]) {
          throw new Error(`v-data-table 用のヘッダーがない。headerTextに追加してください。: ${key}`);
        }
        data.push({
          value: key,
          text: headerText[key],
        });
      }
      return data;
    }
    return JSON.stringify({
      scenario: {
        headers: vueTableHeader(scenarios[0]),
        items: scenarios,
      },
      player: {
        headers: vueTableHeader(players[0]),
        items: players,
      },
      pre_condition: {
        headers: vueTableHeader(preConditions[0]),
        items: preConditions,
      },
      post_condition: {
        headers: vueTableHeader(postConditions[0]),
        items: postConditions,
      },
      scenario_ids: scenarioIds,
      scenario_flows: scenarioFlows,
      scenario_dtables: scenarioDts,
      uc: uc,
    });
  }

  private write(ucId: string, jsondata: string) {
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
    #test-scenario-flow table td,
    #test-scenario-flow table th {
      border-left: thin solid rgba(0, 0, 0, .12);
      /* 横線を消す */
      /*border-bottom: none;*/
    }
    /* 表の外枠線を描く */
    #test-scenario-flow table {
      border-top: thin solid rgba(0, 0, 0, .12);
      border-bottom: thin solid rgba(0, 0, 0, .12);
      border-right: thin solid rgba(0, 0, 0, .12);
    }
    /* テスト手順の表の偶数列をグレーにする */
    #test-scenario-flow table td:nth-child(2n),
    #test-scenario-flow table th:nth-child(2n) {
      background-color: #EEEEEE;
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
            <v-toolbar-title>ユースケーステスト</v-toolbar-title>
          </v-toolbar>
        </v-row>
        <v-row v-for="scenario_dt in app.scenario_dtables" :key="rowIndex">
          <v-col cols="12">
            <v-card>
              <v-card-text>テスト手順</v-card-subtitle>
              <v-card-title class="text-h6">
              </v-card-title>
              <v-card-subtitle></v-card-subtitle>
              <v-card-text>
                <v-data-table dense :items="scenario_dt.items" :disable-sort="true" class="app-vert-stripes" fixed-header
                  disable-pagination hide-default-footer>

                  <template v-slot:header>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>操作</th>
                        <th>因子</th>
                        <th>水準</th>
                        <th class="app-rule" :class="[
                          ruleNo%2==1 ? 'app-odd': 'app-even',
                          ruleNo == (selectedRuleIndex+1) ? 'app-rule-selected': '',
                        ]" v-for="ruleNo of scenario_dt.countOfRules">{{ ruleNo }}</th>
                      </tr>
                    </thead>
                  </template>

                  <template v-slot:body="{ items }">
                    <tbody>
                      <tr v-for="(item, rowIndex) in items" :key="rowIndex">
                        <td>{{ item.step_id }}</td>
                        <td>{{ item.operation_desc }}</td>
                        <td>{{ item.factor_desc }}</td>
                        <td>{{ item.factor_select_item }}</td>
                        <td
                          class="app-rule"
                          :class="[
                            i%2==0 ? 'app-odd': 'app-even',
                            i == selectedRuleIndex ? 'app-rule-selected': '',
                          ]"
                          v-for="(choice, i) in item.factor_select_rules"
                          v-on:mouseover="onRule(i, rowIndex)"
                          v-on:mouseleave="onRule(-1, rowIndex)"
                          >{{ choice }}</td>
                      </tr>
                      <tr>
                        <th>ID</th>
                        <th>操作</th>
                        <th>因子</th>
                        <th>選択肢</th>
                        <th class="app-rule" :class="[
                          ruleNo%2==1 ? 'app-odd': 'app-even',
                          ruleNo == (selectedRuleIndex+1) ? 'app-rule-selected': '',
                        ]" v-for="ruleNo of app.countOfStepRules">{{ ruleNo }}</th>
                      </tr>
                    </tbody>
                  </template>

                </v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title class="text-h6">
                テストシナリオ
              </v-card-title>
              <v-card-subtitle>ユースケースのフローの分岐を網羅します。</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="app.scenario.headers" :items="app.scenario.items" :disable-sort="true"
                  disable-pagination hide-default-footer></v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="4">
            <v-card>
              <v-card-title class="text-h6">
                Player
              </v-card-title>
              <v-card-subtitle>テストに登場するアクターとシステム</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="app.player.headers" :items="app.player.items" :disable-sort="true"
                  disable-pagination hide-default-footer></v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="4">
            <v-card>
              <v-card-title class="text-h6">
                事前条件
              </v-card-title>
              <v-card-subtitle></v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="app.pre_condition.headers" :items="app.pre_condition.items" :disable-sort="true"
                  fixed-header disable-pagination hide-default-footer></v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="4">
            <v-card>
              <v-card-title class="text-h6">
                事後条件
              </v-card-title>
              <v-card-subtitle></v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="app.post_condition.headers" :items="app.post_condition.items" :disable-sort="true"
                  fixed-header disable-pagination hide-default-footer></v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12">
            <v-card id="test-scenario-flow">
              <v-card-title class="text-h6">
                テストシナリオのフロー
              </v-card-title>
              <v-card-subtitle>○のついたフローを縦方向に進めてください</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :items="app.scenario_flows" :disable-sort="true" fixed-header
                  disable-pagination hide-default-footer>

                  <template v-slot:header="{ headers }">
                    <thead>
                      <tr>
                        <th>フローID</th>
                        <th v-for="sid in app.scenario_ids">
                          {{ sid }}
                        </th>
                        <th>Player ID</th>
                        <th>説明</th>
                      </tr>
                    </thead>
                  </template>

                  <template v-slot:body="{ items }">
                    <tbody>
                      <tr v-for="item in items" :key="item.flow_id">
                        <td>
                          {{ item.flow_id }}
                        </td>
                        <td v-for="on in item.on_scenario">{{ on }}</td>
                        <td>{{ item.player_id }}</td>
                        <td>

                          <div>
                            <span v-if="item.tooltips != ''">
                              <v-icon v-if="item.branch_type == 'branch'" v-bind="attrs" v-on="on">mdi-arrow-right-thick
                              </v-icon>
                              <v-icon v-if="item.branch_type == 'alt'" v-bind="attrs" v-on="on" color="green darken-2">
                                mdi-arrow-right-thick</v-icon>
                              <v-icon v-if="item.branch_type == 'ex'" v-bind="attrs" v-on="on" color="orange darken-5">
                                mdi-arrow-right-thick</v-icon>
                            </span>
                            {{ item.tooltips }}
                          </div>
                          <div>{{ item.desc }}</div>

                        </td>
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
        // window.addEventListener('resize', this.onResize);
        // this.onResize();
      },
      unmounted() {
        // window.removeEventListener('resize', this.onResize);
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
    const mdpath = path.join(this.option.output, `${ucId}.html`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
