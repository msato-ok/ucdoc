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

    interface ISummaryItem {
      summary_id: string;
      type: string;
      usecase: string;
      desc: string;
    }
    const summaryIdPrefix = 'TP';
    const summaryItems: ISummaryItem[] = [];
    const baseSummaryItem: ISummaryItem = {
      summary_id: `${summaryIdPrefix}01`,
      type: '正常系',
      usecase: '基本フロー',
      desc: '正常に実行されて事後条件が成立する状態',
    };
    summaryItems.push(baseSummaryItem);
    const altexSummryMap = new Map<spec.AbstractAltExFlow, ISummaryItem>();
    for (const altFlow of uc.alternateFlows.flows) {
      const summaryCount = summaryItems.length + 1;
      const item: ISummaryItem = {
        summary_id: `${summaryIdPrefix}${util.zeropad(summaryCount, 2)}`,
        type: '準正常系',
        usecase: `代替フロー(${altFlow.id.toString})`,
        desc: altFlow.description.text,
      };
      summaryItems.push(item);
      altexSummryMap.set(altFlow, item);
    }
    for (const exFlow of uc.exceptionFlows.flows) {
      const summaryCount = summaryItems.length + 1;
      const item: ISummaryItem = {
        summary_id: `${summaryIdPrefix}${util.zeropad(summaryCount, 2)}`,
        type: '異常系',
        usecase: `例外フロー(${exFlow.id.toString})`,
        desc: exFlow.description.text,
      };
      summaryItems.push(item);
      altexSummryMap.set(exFlow, item);
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
    interface IStep {
      branchType: BranchType;
      flow: spec.Flow;
      summaries: Map<ISummaryItem, string>;
      tooltips: string;
    }
    const testSteps: IStep[] = [];
    const onMark = '○';
    function initSummaries(): Map<ISummaryItem, string> {
      const summaries = new Map<ISummaryItem, string>();
      for (const summary of summaryItems) {
        summaries.set(summary, '');
      }
      return summaries;
    }
    // summaryStartFlow には、代替フルーからの戻り先の基本フローがセットされる。
    // 基本フローのループ bFlow が summaryStartFlow に到達するまでは、処理されない。
    // summaryStartFlow にそもそも登録がない場合は、戻り先を制御する必要がないことを意味する。
    // 例外フローは、基本フローに戻ることがないので、以降のループで出現することのない bFlow を
    // セットして、マーキングされることがないようにする。
    const summaryStartFlow = new Map<ISummaryItem, spec.Flow>();
    for (const bFlow of uc.basicFlows.flows) {
      const stepItem: IStep = {
        branchType: bFlow.refFlows.length > 0 ? 'basic' : 'none',
        flow: bFlow,
        summaries: initSummaries(),
        tooltips: '',
      };
      if (stepItem.branchType == 'basic') {
        stepItem.tooltips = '正常系の分岐パターン';
      }
      testSteps.push(stepItem);
      // bFlow を実行するテストケース（テスト手順で○になるもの）を、
      // markingSummaries 配列に残す。
      // 最初は、全テストケースを入れておいて、ループしながら消す
      const markingSummaries = Array.from(stepItem.summaries.keys());
      for (const refFlow of bFlow.refFlows) {
        const summary = altexSummryMap.get(refFlow);
        if (!summary) {
          throw new Error('summary が altexSummryMap の中にない状態はバグ');
        }
        // フローが分岐する場合、分岐先のテストケースは、○にならないので削除する
        for (let i = 0; i < markingSummaries.length; i++) {
          const refSummary = altexSummryMap.get(refFlow);
          if (markingSummaries[i] == refSummary) {
            markingSummaries.splice(i, i + 1);
          }
        }
        const branchType = refFlow instanceof spec.AlternateFlow ? 'alt' : 'ex';
        for (const nFlow of refFlow.nextFlows.flows) {
          const nStep: IStep = {
            branchType: branchType,
            flow: nFlow,
            summaries: initSummaries(),
            tooltips: `${summary.usecase}の分岐パターン`,
          };
          // 分岐先のフローは、常に1つのテストケースしか○にならない
          nStep.summaries.set(summary, onMark);
          testSteps.push(nStep);
        }
        if (refFlow instanceof spec.AlternateFlow) {
          const altFlow: spec.AlternateFlow = refFlow;
          summaryStartFlow.set(summary, altFlow.returnFlow);
        } else {
          summaryStartFlow.set(summary, bFlow);
        }
      }
      for (const markSummary of markingSummaries) {
        const startFlow = summaryStartFlow.get(markSummary);
        if (startFlow) {
          if (startFlow != bFlow) {
            continue;
          }
          summaryStartFlow.delete(markSummary);
        }
        stepItem.summaries.set(markSummary, onMark);
      }
    }
    // テスト手順はテストシナリオが横列で動的にプロパティが増えるので連想配列に入れ直す
    const testStepJsons = [];
    for (const testStep of testSteps) {
      const testStepJson: Record<string, string> = {};
      testStepJson['flow_id'] = testStep.flow.id.toString;
      testStep.summaries.forEach((mark: string, summary: ISummaryItem) => {
        testStepJson[summary.summary_id] = mark;
      });
      testStepJson['player_id'] = testStep.flow.player.id.toString;
      testStepJson['desc'] = testStep.flow.description.text;
      testStepJson['branch_type'] = testStep.branchType;
      testStepJson['tooltips'] = testStep.tooltips;
      testStepJsons.push(testStepJson);
    }
    // v-data-table のデータは、headers に無くて、items にだけあるプロパティは、
    // 表にはレンダリングされないので、表出対象以外のデータのヘッダーは null にしておいて
    // ヘッダー構成に出力しないようにする。
    const headerText: Record<string, string | null> = {
      summary_id: 'No',
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
    for (const summary of summaryItems) {
      headerText[summary.summary_id] = summary.summary_id;
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
        summary: {
          headers: vueTableHeader(summaryItems[0]),
          items: summaryItems,
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
        step: {
          headers: vueTableHeader(testStepJsons[0]),
          items: testStepJsons,
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
    /* テスト手順の表に縦線を入れる */
    #test-step table td,
    #test-step table th {
      border-left: thin solid rgba(0, 0, 0, .12);
      /* 横線を消す */
      /*border-bottom: none;*/
    }
    /* 表の外枠線を描く */
    #test-step table {
      border-top: thin solid rgba(0, 0, 0, .12);
      border-bottom: thin solid rgba(0, 0, 0, .12);
      border-right: thin solid rgba(0, 0, 0, .12);
    }
    /* テスト手順の表の偶数列をグレーにする */
    #test-step table td:nth-child(2n),
    #test-step table th:nth-child(2n) {
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
                <v-data-table dense :headers="summary.headers" :items="summary.items" :disable-sort="true"
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
            <v-card id="test-step">
              <v-card-title class="text-h6">
                テスト手順
              </v-card-title>
              <v-card-subtitle>○のついたフローを縦方向に進めてください</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="step.headers" :items="step.items" :disable-sort="true" fixed-header
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
