import { App } from '../spec/app';
import { SpecCommand } from './base';
import { InvalidArgumentError } from '../common';
import { entityContains } from '../spec/core';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { UseCase } from '../spec/usecase';
import {
  UcScenarioCollectionFactory,
  UcScenarioCollection,
  UcScenario,
  UcScenarioType,
  BranchType,
} from '../spec/uc_scenario';
import { AlternateFlow, ExceptionFlow } from '../spec/flow';

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

/*
interface IStep {
}

class StepSection {
  private _steps: IStep[];

  constructor() {
    this._steps = <IStep[]>[];
  }

  get items(): IStep[] {
    return this._steps;
  }
        {
          scenario_id: "TP01",
          scenario_name: "基本フロー",
          scenario_detail: "正常に実行されて事後条件が成立する状態",
          step_rows: [
            {
              check_point_id: "B01",
              operation: "[加盟店登録内容確認(画面)][] にアクセスする",
              factor: "",
              factor_item: "",
            } as IStepRow,
            {
              check_point_id: "B02",
              operation: "審査の申込状況を確認するために [審査案件取得API][] を実行する",
              factor: "",
              factor_item: "",
            } as IStepRow,
          ],
        } as IStep, {
}
*/

export class UsecaseTestCommand implements SpecCommand {
  constructor(private output: string) {}

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
    function scenarioColums(flowOnScenarios: UcScenario[]): string[] {
      const cols = [];
      for (const horzScenario of ucAllScenario.scenarios) {
        if (entityContains(flowOnScenarios, horzScenario)) {
          cols.push('○');
        } else {
          cols.push(' ');
        }
      }
      return cols;
    }
    const scenarioIds = ucAllScenario.scenarios.map(x => x.id.text);
    const scenarioFlows: IScenarioFlow[] = [];
    let branchFlow: AlternateFlow | ExceptionFlow | undefined = undefined;
    for (const flow of ucAllScenario.flows) {
      let tooltips = '';
      const branchType = ucAllScenario.getBranchType(flow);
      if (branchType == BranchType.Branch) {
        tooltips = '基本フローの分岐点';
      } else if (branchType == BranchType.Alternate) {
        const parent = uc.getAltExFlowByChildFlow(flow);
        if (!parent) {
          throw new InvalidArgumentError('BranchType.Alternate で代替フローの親を持たないフローはバグ');
        }
        if (branchFlow != parent) {
          tooltips = `代替フロー${parent.id.text}に分岐（${parent.description.text}）`;
          branchFlow = parent;
        }
      } else if (branchType == BranchType.Exception) {
        const parent = uc.getAltExFlowByChildFlow(flow);
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
      scenarioFlows.push({
        flow_id: flow.id.text,
        on_scenario: scenarioColums(ucAllScenario.getScenariosByFLow(flow)),
        player_id: flow.player.id.text,
        desc: flow.description.text,
        tooltips: tooltips,
        branch_type: branchType,
      });
    }
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
      steps: [
        /*
        {
          scenario_id: "TP01",
          scenario_name: "基本フロー",
          scenario_detail: "正常に実行されて事後条件が成立する状態",
          step_rows: [
            {
              check_point_id: "B01",
              operation: "[加盟店登録内容確認(画面)][] にアクセスする",
              factor: "",
              factor_item: "",
            } as IStepRow,
            {
              check_point_id: "B02",
              operation: "審査の申込状況を確認するために [審査案件取得API][] を実行する",
              factor: "",
              factor_item: "",
            } as IStepRow,
          ],
        } as IStep, {
          scenario_id: "TP02",
          scenario_name: "代替フロー(A01)",
          scenario_detail: "審査案件は申込処理中の状態で存在し、処理開始から5分以上経過",
          step_rows: [
            {
              check_point_id: "B01",
              operation: "[加盟店登録内容確認(画面)][] にアクセスする",
              factor: "",
              factor_item: "",
            } as IStepRow,
            {
              check_point_id: "B02",
              operation: "審査の申込状況を確認するために [審査案件取得API][] を実行する",
              factor: "",
              factor_item: "",
            } as IStepRow,
          ],
        } as IStep,
*/
      ],
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
        <v-row v-for="step in app.steps" :key="rowIndex">
          <v-col cols="12">
            <v-card>
              <v-card-text>テスト手順</v-card-subtitle>
              <v-card-title class="text-h6">
                {{ step.scenario_id }} {{ step.scenario_name }}
              </v-card-title>
              <v-card-subtitle>{{ step.scenario_detail }}</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :items="step.step_rows" :disable-sort="true"
                  disable-pagination hide-default-footer>

                  <template v-slot:header>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>操作</th>
                        <th>因子</th>
                        <th>選択肢</th>
                      </tr>
                    </thead>
                  </template>

                  <template v-slot:body="{ step_rows }">
                    <tbody>
                      <tr v-for="(row, rowIndex) in step_rows" :key="rowIndex">
                        <td>{{ row.check_point_id }}</td>
                        <td>{{ row.operation }}</td>
                        <td>{{ row.factor }}</td>
                        <td>{{ row.factor_item }}</td>
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
        // onResize() {
        //   let height = window.innerHeight;
        //   const headerRow = document.querySelector('.app_toolbar__wrapper');
        //   height -= headerRow.clientHeight;
        //   const dtable = document.querySelector('.v-data-table__wrapper');
        //   dtable.style.height = height + 'px';
        // },
      },
      data() {
        return {
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
    const mdpath = path.join(this.output, `${ucId}.html`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
