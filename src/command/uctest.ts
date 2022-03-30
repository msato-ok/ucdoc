import * as spec from '../spec';
import * as base from './base';
import * as util from '../util';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';

export class UsecaseTestCommand implements base.SpecCommand {
  constructor(private output: string) {}

  public execute(spc: spec.App): void {
    spc.usecases.forEach(uc => {
      this.writeUc(spc, uc);
    });
  }

  private writeUc(app: spec.App, uc: spec.UseCase) {
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

    interface IScenarioItem {
      scenario_id: string;
      type: string;
      usecase: string;
      desc: string;
    }
    const scenarioIdPrefix = 'TP';
    const scenarioItems: IScenarioItem[] = [];
    const baseScenarioItem: IScenarioItem = {
      scenario_id: `${scenarioIdPrefix}01`,
      type: '正常系',
      usecase: '基本フロー',
      desc: '正常に実行されて事後条件が成立する状態',
    };
    scenarioItems.push(baseScenarioItem);
    const altexScenarioMap = new Map<spec.AbstractAltExFlow, IScenarioItem>();
    for (const altFlow of uc.alternateFlows.flows) {
      const scenarioCount = scenarioItems.length + 1;
      const item: IScenarioItem = {
        scenario_id: `${scenarioIdPrefix}${util.zeropad(scenarioCount, 2)}`,
        type: '準正常系',
        usecase: `代替フロー(${altFlow.id.toString})`,
        desc: altFlow.description.text,
      };
      scenarioItems.push(item);
      altexScenarioMap.set(altFlow, item);
    }
    for (const exFlow of uc.exceptionFlows.flows) {
      const scenarioCount = scenarioItems.length + 1;
      const item: IScenarioItem = {
        scenario_id: `${scenarioIdPrefix}${util.zeropad(scenarioCount, 2)}`,
        type: '異常系',
        usecase: `例外フロー(${exFlow.id.toString})`,
        desc: exFlow.description.text,
      };
      scenarioItems.push(item);
      altexScenarioMap.set(exFlow, item);
    }
    interface IPlayerItem {
      player_id: string;
      desc: string;
    }
    const playerItems: IPlayerItem[] = [];
    for (const player of uc.players) {
      playerItems.push({
        player_id: player.id.toString,
        desc: player.text,
      });
    }
    interface IPreConditionItem {
      pre_condition_id: string;
      desc: string;
    }
    const preConditionItems: IPreConditionItem[] = [];
    for (const cond of uc.preConditions) {
      preConditionItems.push({
        pre_condition_id: cond.id.toString,
        desc: cond.description.text,
      });
    }
    interface IPostConditionItem {
      post_condition_id: string;
      desc: string;
    }
    const postConditionItems: IPostConditionItem[] = [];
    for (const cond of uc.postConditions) {
      postConditionItems.push({
        post_condition_id: cond.id.toString,
        desc: cond.description.text,
      });
    }
    type BranchType = 'none' | 'basic' | 'alt' | 'ex';
    interface IScenarioOutline {
      branchType: BranchType;
      flow: spec.Flow;
      scenarios: Map<IScenarioItem, string>;
      tooltips: string;
    }
    const testScenarioOutlines: IScenarioOutline[] = [];
    const onMark = '○';
    function initScenarios(): Map<IScenarioItem, string> {
      const scenarios = new Map<IScenarioItem, string>();
      for (const scenario of scenarioItems) {
        scenarios.set(scenario, '');
      }
      return scenarios;
    }
    // scenarioStartFlow には、代替フルーからの戻り先の基本フローがセットされる。
    // 基本フローのループ bFlow が scenarioStartFlow に到達するまでは、処理されない。
    // scenarioStartFlow にそもそも登録がない場合は、戻り先を制御する必要がないことを意味する。
    // 例外フローは、基本フローに戻ることがないので、以降のループで出現することのない bFlow を
    // セットして、マーキングされることがないようにする。
    const scenarioStartFlow = new Map<IScenarioItem, spec.Flow>();
    for (const bFlow of uc.basicFlows.flows) {
      const scenarioOutline: IScenarioOutline = {
        branchType: bFlow.refFlows.length > 0 ? 'basic' : 'none',
        flow: bFlow,
        scenarios: initScenarios(),
        tooltips: '',
      };
      if (scenarioOutline.branchType == 'basic') {
        scenarioOutline.tooltips = '基本フローの分岐パターン';
      }
      testScenarioOutlines.push(scenarioOutline);
      // bFlow を実行するテストケース（テスト手順で○になるもの）を、
      // markingScenarios 配列に残す。
      // 最初は、全テストケースを入れておいて、ループしながら消す
      const markingScenarios = Array.from(scenarioOutline.scenarios.keys());
      for (const refFlow of bFlow.refFlows) {
        const scenario = altexScenarioMap.get(refFlow);
        if (!scenario) {
          throw new Error('scenario が altexScenarioMap の中にない状態はバグ');
        }
        // フローが分岐する場合、分岐先のテストケースは、○にならないので削除する
        for (let i = 0; i < markingScenarios.length; i++) {
          const refScenario = altexScenarioMap.get(refFlow);
          if (markingScenarios[i] == refScenario) {
            markingScenarios.splice(i, i + 1);
          }
        }
        const branchType = refFlow instanceof spec.AlternateFlow ? 'alt' : 'ex';
        for (const nFlow of refFlow.nextFlows.flows) {
          const nextScenarioOutline: IScenarioOutline = {
            branchType: branchType,
            flow: nFlow,
            scenarios: initScenarios(),
            tooltips: `${scenario.usecase}の分岐パターン`,
          };
          // 分岐先のフローは、常に1つのテストケースしか○にならない
          nextScenarioOutline.scenarios.set(scenario, onMark);
          testScenarioOutlines.push(nextScenarioOutline);
        }
        if (refFlow instanceof spec.AlternateFlow) {
          const altFlow: spec.AlternateFlow = refFlow;
          scenarioStartFlow.set(scenario, altFlow.returnFlow);
        } else {
          scenarioStartFlow.set(scenario, bFlow);
        }
      }
      for (const markScenario of markingScenarios) {
        const startFlow = scenarioStartFlow.get(markScenario);
        if (startFlow) {
          if (startFlow != bFlow) {
            continue;
          }
          scenarioStartFlow.delete(markScenario);
        }
        scenarioOutline.scenarios.set(markScenario, onMark);
      }
    }
    // テストシナリオのフローはテストシナリオが横列で動的にプロパティが増えるので連想配列に入れ直す
    const scenarioOutlineJsons = [];
    for (const scenarioOutline of testScenarioOutlines) {
      const dic: Record<string, string> = {};
      dic['flow_id'] = scenarioOutline.flow.id.toString;
      scenarioOutline.scenarios.forEach((mark: string, scenario: IScenarioItem) => {
        dic[scenario.scenario_id] = mark;
      });
      dic['player_id'] = scenarioOutline.flow.player.id.toString;
      dic['desc'] = scenarioOutline.flow.description.text;
      dic['branch_type'] = scenarioOutline.branchType;
      dic['tooltips'] = scenarioOutline.tooltips;
      scenarioOutlineJsons.push(dic);
    }
    // v-data-table のデータは、headers に無くて、items にだけあるプロパティは、
    // 表にはレンダリングされないので、表出対象以外のデータのヘッダーは null にしておいて
    // ヘッダー構成に出力しないようにする。
    const headerText: Record<string, string | null> = {
      scenario_id: 'No',
      type: '分類',
      usecase: 'ユースケース',
      desc: '説明',
      player_id: 'Player ID',
      pre_condition_id: 'ID',
      post_condition_id: 'ID',
      flow_id: 'フローID',
      branch_type: null,
      tooltips: null,
    };
    for (const scenario of scenarioItems) {
      headerText[scenario.scenario_id] = scenario.scenario_id;
    }
    function vueTableHeader(item: any) {
      const data = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      for (const key of Object.keys(item)) {
        if (headerText[key] === null) {
          continue;
        }
        data.push({
          value: key,
          text: headerText[key],
        });
      }
      return data;
    }
    const data = {
      data: JSON.stringify({
        scenario: {
          headers: vueTableHeader(scenarioItems[0]),
          items: scenarioItems,
        },
        player: {
          headers: vueTableHeader(playerItems[0]),
          items: playerItems,
        },
        pre_condition: {
          headers: vueTableHeader(preConditionItems[0]),
          items: preConditionItems,
        },
        post_condition: {
          headers: vueTableHeader(postConditionItems[0]),
          items: postConditionItems,
        },
        scenario_outline: {
          headers: vueTableHeader(scenarioOutlineJsons[0]),
          items: scenarioOutlineJsons,
        },
      }),
    };
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
    #test-scenario-outline table td,
    #test-scenario-outline table th {
      border-left: thin solid rgba(0, 0, 0, .12);
      /* 横線を消す */
      /*border-bottom: none;*/
    }
    /* 表の外枠線を描く */
    #test-scenario-outline table {
      border-top: thin solid rgba(0, 0, 0, .12);
      border-bottom: thin solid rgba(0, 0, 0, .12);
      border-right: thin solid rgba(0, 0, 0, .12);
    }
    /* テスト手順の表の偶数列をグレーにする */
    #test-scenario-outline table td:nth-child(2n),
    #test-scenario-outline table th:nth-child(2n) {
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
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title class="text-h6">
                テストシナリオ
              </v-card-title>
              <v-card-subtitle>ユースケースのフローの分岐を網羅します。</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="scenario.headers" :items="scenario.items" :disable-sort="true"
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
                <v-data-table dense :headers="player.headers" :items="player.items" :disable-sort="true"
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
                <v-data-table dense :headers="pre_condition.headers" :items="pre_condition.items" :disable-sort="true"
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
                <v-data-table dense :headers="post_condition.headers" :items="post_condition.items" :disable-sort="true"
                  fixed-header disable-pagination hide-default-footer></v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12">
            <v-card id="test-scenario-outline">
              <v-card-title class="text-h6">
                テストシナリオのフロー
              </v-card-title>
              <v-card-subtitle>○のついたフローを縦方向に進めてください</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="scenario_outline.headers" :items="scenario_outline.items" :disable-sort="true" fixed-header
                  disable-pagination hide-default-footer>
                  <template v-slot:item.flow_id="{ item }">

                    <v-tooltip bottom v-if="item.branch_type != 'none'" >
                      <template v-slot:activator="{ on, attrs }">
                        <v-icon v-if="item.branch_type == 'basic'" v-bind="attrs" v-on="on">mdi-arrow-right-thick</v-icon>
                        <v-icon v-if="item.branch_type == 'alt'" v-bind="attrs" v-on="on" color="green darken-2">mdi-arrow-right-thick</v-icon>
                        <v-icon v-if="item.branch_type == 'ex'" v-bind="attrs" v-on="on" color="orange darken-5">mdi-arrow-right-thick</v-icon>
                      </template>
                      <div>{{ item.tooltips }}</div>
                    </v-tooltip>

                    {{ item.flow_id }}
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
      data() {
        return <%- data %>;
      },
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
      }
    })
  </script>
</body>

</html>
%>
`;
    const mdtext = ejs.render(template.trimStart(), data, {});
    const mdpath = path.join(this.output, `${uc.id.toString}.html`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
