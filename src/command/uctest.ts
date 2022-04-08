import { App } from '../spec/app';
import { SpecCommand } from './base';
import { BugError } from '../common';
import * as util from '../util';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { UseCase } from '../spec/usecase';
import { Flow, AlternateFlow, AbstractAltExFlow } from '../spec/flow';

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

interface IScenarioItem {
  scenario_id: string;
  type: string;
  usecase: string;
  desc: string;
}

class ScenarioSection {
  private _items: IScenarioItem[] = [];
  private _branchFlowScenarioRelation = new Map<AbstractAltExFlow, IScenarioItem>();

  constructor(readonly baseItem: IScenarioItem) {
    this._items.push(baseItem);
  }

  get items(): IScenarioItem[] {
    return this._items;
  }

  addBranchItem(flow: AbstractAltExFlow, item: IScenarioItem) {
    this._items.push(item);
    this._branchFlowScenarioRelation.set(flow, item);
  }

  getByFlow(flow: AbstractAltExFlow): IScenarioItem | undefined {
    return this._branchFlowScenarioRelation.get(flow);
  }
}

class ScenarioSectionFactory {
  static getInstance(uc: UseCase): ScenarioSection {
    const scenarioIdPrefix = 'TP';
    const scenarioSection = new ScenarioSection({
      scenario_id: `${scenarioIdPrefix}01`,
      type: '正常系',
      usecase: '基本フロー',
      desc: '正常に実行されて事後条件が成立する状態',
    });
    for (const altFlow of uc.alternateFlows.flows) {
      const scenarioCount = scenarioSection.items.length + 1;
      const item: IScenarioItem = {
        scenario_id: `${scenarioIdPrefix}${util.zeropad(scenarioCount, 2)}`,
        type: '準正常系',
        usecase: `代替フロー(${altFlow.id.text})`,
        desc: altFlow.description.text,
      };
      scenarioSection.addBranchItem(altFlow, item);
    }
    for (const exFlow of uc.exceptionFlows.flows) {
      const scenarioCount = scenarioSection.items.length + 1;
      const item: IScenarioItem = {
        scenario_id: `${scenarioIdPrefix}${util.zeropad(scenarioCount, 2)}`,
        type: '異常系',
        usecase: `例外フロー(${exFlow.id.text})`,
        desc: exFlow.description.text,
      };
      scenarioSection.addBranchItem(exFlow, item);
    }
    return scenarioSection;
  }
}

interface IPlayerItem {
  player_id: string;
  desc: string;
}

class SimpleItemSection<T> {
  private _items: T[];

  constructor() {
    this._items = <T[]>[];
  }

  get items(): T[] {
    return this._items;
  }

  add(item: T) {
    this._items.push(item);
  }
}

class PlayerSectionFactory {
  static getInstance(uc: UseCase): SimpleItemSection<IPlayerItem> {
    const section = new SimpleItemSection<IPlayerItem>();
    for (const player of uc.players) {
      section.add({
        player_id: player.id.text,
        desc: player.text,
      });
    }
    return section;
  }
}

interface IPreConditionItem {
  pre_condition_id: string;
  desc: string;
}

class PreConditionSectionFactory {
  static getInstance(uc: UseCase): SimpleItemSection<IPreConditionItem> {
    const section = new SimpleItemSection<IPreConditionItem>();
    for (const cond of uc.preConditions) {
      section.add({
        pre_condition_id: cond.id.text,
        desc: cond.description.text,
      });
    }
    return section;
  }
}

interface IPostConditionItem {
  post_condition_id: string;
  desc: string;
}

class PostConditionSectionFactory {
  static getInstance(uc: UseCase): SimpleItemSection<IPostConditionItem> {
    const section = new SimpleItemSection<IPostConditionItem>();
    for (const cond of uc.postConditions) {
      section.add({
        post_condition_id: cond.id.text,
        desc: cond.description.text,
      });
    }
    return section;
  }
}

// 分岐タイプ
// シナリオフローのところにフローの分岐アイコンを表示するが、
// そのアイコンの種別
type BranchType = 'none' | 'basic' | 'alt' | 'ex';

interface IScenarioFlow {
  branchType: BranchType;
  flow: Flow;
  scenarios: Map<IScenarioItem, string>;
  tooltips: string;
}

/**
 * シナリオフローのセクションのデータ
 *
 * 縦にユースケースのフロー、横にシナリオの表を作って、
 * シナリオを進める上で、実行されるフローが何かを示すための表で、
 * マーカー（○）を付けて、フローの流れがわかるようにする。
 *
 * 横列は scenarioSection.items になる。
 * 縦行は、基本フローと代替フロー、例外フローが重複無く漏れ無く並んでいく。
 */
class ScenarioFlowSection {
  private _items: IScenarioFlow[];

  constructor() {
    this._items = <IScenarioFlow[]>[];
  }

  get items(): IScenarioFlow[] {
    return this._items;
  }

  add(item: IScenarioFlow) {
    this._items.push(item);
  }
}

class ScenarioFlowSectionFactory {
  static getInstance(uc: UseCase, scenarioSection: ScenarioSection): ScenarioFlowSection {
    const scenarioFlowSection = new ScenarioFlowSection();
    const onMark = '○';
    // scenarioRetartPos の使い方
    // これには、代替フローからの戻り先の基本フローがセットされ、フローの再開位置を表す。
    //
    // key: シナリオ
    // value: 分岐した代替・例外フローから再開する基本フローが入る
    //
    // この Map にエントリーされていない状態は、そのシナリオは、まだ分岐していない状態なので、
    // 再開位置を気にする必要がない。
    //
    // scenarioRetartPos にシナリオのエントリーがある場合には、 bFlow が一致するかを確認して、
    // 一致しない場合には、まだ再開するフローの位置に到達していないので、そのシナリオ列は ○ にならない。
    // 再開するフローが一致するか、あるいは、Map にエントリーされていない場合には、 markingScenarios に従って、
    // ○ 付け判定する。
    //
    // 尚、例外フローは、基本フローに戻ることがないので、以降のループで出現することのないので、
    // 現在行の bFlow を再開位置としてセットして、再開されることがない状態にする。
    //
    // markingScenarios の使い方
    // この配列を、基本フロー（bFlow）の行の横列のシナリオのマス目に見立てて使う。
    // 配列の中にシナリオIDがある場合は ○ になる。
    // 配列の初期状態では、基本フロー（bFlow）が、全シナリオで実行される（○になる）状態にして、
    // 分岐する代替・例外フローを走査して、代替・例外フローに対応したシナリオを配列から削除する
    const scenarioRestartPos = new Map<IScenarioItem, Flow>();
    for (const bFlow of uc.basicFlows.flows) {
      const scenarioFlow = this.appendBaseFlow(scenarioFlowSection, bFlow, scenarioSection);
      const markingScenarios = Array.from(scenarioFlow.scenarios.keys());
      for (const refFlow of bFlow.refFlows) {
        const refScenarioFlows = this.appendRefFlow(scenarioFlowSection, refFlow, scenarioSection);
        const scenario = scenarioSection.getByFlow(refFlow);
        if (!scenario) {
          throw new BugError('scenario が scenarioSection の中にない状態は、ありえないのでバグ');
        }
        if (refFlow instanceof AlternateFlow) {
          const altFlow: AlternateFlow = refFlow;
          scenarioRestartPos.set(scenario, altFlow.returnFlow);
        } else {
          scenarioRestartPos.set(scenario, bFlow);
        }
        // シナリオは、分岐パターン毎に1つなので、フローが分岐する場合、
        // この段階で分岐先シナリオに ○ をつける。
        // また、分岐先シナリオ以外の、他の分岐シナリオのマスを空白にする
        for (const rso of refScenarioFlows) {
          rso.scenarios.set(scenario, onMark);
        }
        for (let i = 0; i < markingScenarios.length; i++) {
          const refScenario = scenarioSection.getByFlow(refFlow);
          if (markingScenarios[i] == refScenario) {
            delete markingScenarios[i];
          }
        }
      }
      for (const markScenario of markingScenarios) {
        if (!markScenario) {
          continue;
        }
        const startFlow = scenarioRestartPos.get(markScenario);
        if (startFlow) {
          if (startFlow != bFlow) {
            continue;
          }
          scenarioRestartPos.delete(markScenario);
        }
        scenarioFlow.scenarios.set(markScenario, onMark);
      }
    }
    return scenarioFlowSection;
  }

  /* 表の横列をマーカー無しの状態に初期化する */
  private static initTableColumns(scenarioSection: ScenarioSection): Map<IScenarioItem, string> {
    const scenarios = new Map<IScenarioItem, string>();
    for (const scenario of scenarioSection.items) {
      scenarios.set(scenario, '');
    }
    return scenarios;
  }

  private static appendBaseFlow(
    scenarioFlowSection: ScenarioFlowSection,
    bFlow: Flow,
    scenarioSection: ScenarioSection
  ): IScenarioFlow {
    const branchType = bFlow.refFlows.length > 0 ? 'basic' : 'none';
    const scenarioFlow: IScenarioFlow = {
      branchType: branchType,
      flow: bFlow,
      scenarios: this.initTableColumns(scenarioSection),
      tooltips: '',
    };
    if (branchType == 'basic') {
      scenarioFlow.tooltips = '基本フローの分岐パターン';
    }
    scenarioFlowSection.add(scenarioFlow);
    return scenarioFlow;
  }

  private static appendRefFlow(
    scenarioFlowSection: ScenarioFlowSection,
    refFlow: AbstractAltExFlow,
    scenarioSection: ScenarioSection
  ): IScenarioFlow[] {
    const scenario = scenarioSection.getByFlow(refFlow);
    if (!scenario) {
      throw new BugError('scenario が altexScenarioMap の中にない状態は、ありえないのでバグ');
    }
    const items: IScenarioFlow[] = [];
    const branchType = refFlow instanceof AlternateFlow ? 'alt' : 'ex';
    for (const nFlow of refFlow.nextFlows.flows) {
      const scenarioFlow: IScenarioFlow = {
        branchType: branchType,
        flow: nFlow,
        scenarios: this.initTableColumns(scenarioSection),
        tooltips: `${scenario.usecase}の分岐パターン`,
      };
      scenarioFlowSection.add(scenarioFlow);
      items.push(scenarioFlow);
    }
    return items;
  }
}

export class UsecaseTestCommand implements SpecCommand {
  constructor(private output: string) {}

  public execute(app: App): void {
    app.usecases.forEach(uc => {
      const data = this.assembleData(uc);
      this.write(uc.id.text, data);
    });
  }

  private assembleData(uc: UseCase): string {
    const scenarioSection = ScenarioSectionFactory.getInstance(uc);
    const playerSection = PlayerSectionFactory.getInstance(uc);
    const preConditionSection = PreConditionSectionFactory.getInstance(uc);
    const postConditionSection = PostConditionSectionFactory.getInstance(uc);
    const scenarioFlowSection = ScenarioFlowSectionFactory.getInstance(uc, scenarioSection);

    // テストシナリオのフローはテストシナリオが横列で動的にプロパティが増えるので連想配列に入れ直す
    const scenarioFlowJsons = [];
    for (const scenarioFlow of scenarioFlowSection.items) {
      const dic: Record<string, string> = {};
      dic['flow_id'] = scenarioFlow.flow.id.text;
      scenarioFlow.scenarios.forEach((mark: string, scenario: IScenarioItem) => {
        dic[scenario.scenario_id] = mark;
      });
      dic['player_id'] = scenarioFlow.flow.player.id.text;
      dic['desc'] = scenarioFlow.flow.description.text;
      dic['branch_type'] = scenarioFlow.branchType;
      dic['tooltips'] = scenarioFlow.tooltips;
      scenarioFlowJsons.push(dic);
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
    for (const scenario of scenarioSection.items) {
      headerText[scenario.scenario_id] = scenario.scenario_id;
    }
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
        headers: vueTableHeader(scenarioSection.items[0]),
        items: scenarioSection.items,
      },
      player: {
        headers: vueTableHeader(playerSection.items[0]),
        items: playerSection.items,
      },
      pre_condition: {
        headers: vueTableHeader(preConditionSection.items[0]),
        items: preConditionSection.items,
      },
      post_condition: {
        headers: vueTableHeader(postConditionSection.items[0]),
        items: postConditionSection.items,
      },
      scenario_flow: {
        headers: vueTableHeader(scenarioFlowJsons[0]),
        items: scenarioFlowJsons,
      },
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
            <v-card id="test-scenario-flow">
              <v-card-title class="text-h6">
                テストシナリオのフロー
              </v-card-title>
              <v-card-subtitle>○のついたフローを縦方向に進めてください</v-card-subtitle>
              <v-card-text>
                <v-data-table dense :headers="scenario_flow.headers" :items="scenario_flow.items" :disable-sort="true" fixed-header
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
    const mdtext = ejs.render(template.trimStart(), { data: jsondata }, {});
    const mdpath = path.join(this.output, `${ucId}.html`);
    fs.writeFileSync(mdpath, mdtext);
  }
}
