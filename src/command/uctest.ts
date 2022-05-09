import { App } from '../spec/app';
import { AbstractSpecCommand } from './base';
import { InvalidArgumentError } from '../common';
import { entityContains } from '../spec/core';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { UseCase } from '../spec/usecase';
import {
  UcScenarioDecisionTableFactory,
  UcScenarioDecisionTable,
  UcScenarioStep,
  UcScenarioStepType,
} from '../spec/uc_scenario_dt';
import {
  UcScenarioCollectionFactory,
  UcScenarioCollection,
  UcScenario,
  UcScenarioType,
  BranchType,
} from '../spec/uc_scenario';
import { AlternateFlow, ExceptionFlow } from '../spec/flow';
import { DTConditionRuleChoice, DTResultRuleChoice } from '../spec/decision_table';
import { PostCondition } from '../spec/prepostcondition';
import { Valiation } from '../spec/valiation';

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
  valiation_id: string;
  valiation_title: string;
  scenario_id: string;
  scenario_title: string;
  scenario_type: string;
  step_link: string;
  countOfRules: number;
  items: IStep[];
}

interface IStep {
  step_colspan: number;
  step_id: string;
  operation_desc: string;
  expected_desc: string;
  factor_desc: string;
  factor_select_item: string;
  factor_select_rules: string[];
  factor_colspan: number;
}

class ScenarioFlowSection {
  private _scenarioFlows: IScenarioFlow[] = [];

  constructor(private ucAllScenario: UcScenarioCollection, private uc: UseCase) {
    this._init();
  }

  get scenarioFlows(): IScenarioFlow[] {
    return this._scenarioFlows;
  }

  private _scenarioColums(flowOnScenarios: UcScenario[]): string[] {
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

  private _init() {
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
        on_scenario: this._scenarioColums(this.ucAllScenario.getScenariosByFLow(flow)),
        player_id: flow.player.id.text,
        desc: flow.description.text,
        tooltips: tooltips,
        branch_type: branchType,
      });
    }
  }
}

interface _IVariationAndScenario {
  ucDt: UcScenarioDecisionTable;
  ucScenario: UcScenario;
  valiation: Valiation;
}

class VariationAndScenarioCollection {
  private _data: _IVariationAndScenario[] = [];

  constructor(readonly ucAllScenario: UcScenarioCollection, readonly uc: UseCase) {}

  get data(): _IVariationAndScenario[] {
    return this._data;
  }

  getUcScenariosByValiation(valiation: Valiation): UcScenario[] {
    const results = [];
    for (const d of this._data) {
      if (d.valiation == valiation) {
        results.push(d.ucScenario);
      }
    }
    return results;
  }

  add(ucDt: UcScenarioDecisionTable, ucScenario: UcScenario, valiation: Valiation) {
    this._data.push({
      ucDt: ucDt,
      ucScenario: ucScenario,
      valiation: valiation,
    });
  }
}

function makeVariationAndScenarioCollection(
  ucAllScenario: UcScenarioCollection,
  uc: UseCase
): VariationAndScenarioCollection {
  const data: VariationAndScenarioCollection = new VariationAndScenarioCollection(ucAllScenario, uc);
  for (const valiation of uc.valiations) {
    for (const ucScenario of ucAllScenario.scenarios) {
      const ucDt = UcScenarioDecisionTableFactory.getInstance(ucScenario, valiation, uc.preConditions);
      if (!ucDt) {
        continue;
      }
      data.add(ucDt, ucScenario, valiation);
    }
  }
  return data;
}

interface IDataVariationScenario {
  valiation_id: string;
  valiation_title: string;
  step_link: string;
  factors_text: string;
  scenario_used: string[];
}

class DataVariationScenarioSection {
  constructor(private variationAndScenarioCollection: VariationAndScenarioCollection) {}

  generate(): IDataVariationScenario[] {
    const results: IDataVariationScenario[] = [];
    const ucAllScenario = this.variationAndScenarioCollection.ucAllScenario;
    let prevLine = {
      valiation_id: '',
      valiation_title: '',
    } as IDataVariationScenario;
    for (const datum of this.variationAndScenarioCollection.data) {
      const choices = datum.ucDt.decisionTable.getUsedFactorLevels().items;
      for (const choice of choices) {
        for (const valiation of this.variationAndScenarioCollection.uc.valiations) {
          if (!valiation.factorEntryPoint.containsChoice(choice)) {
            continue;
          }
          const dataSchenario = {
            valiation_id: valiation.id.text,
            valiation_title: valiation.description.text,
            step_link: '#' + convStepLink(valiation, datum.ucScenario),
            factors_text: datum.ucDt.decisionTable
              .getUsedFactorLevels()
              .items.map(x => x.factor.id.text + ' = ' + x.level.text)
              .join(', '),
            scenario_used: Array(ucAllScenario.scenarios.length).fill(' '),
          } as IDataVariationScenario;
          const sindex = ucAllScenario.indexOfScenario(datum.ucScenario);
          dataSchenario.scenario_used[sindex] = '○';
          if (prevLine.valiation_id == dataSchenario.valiation_id) {
            dataSchenario.valiation_id = '';
          }
          if (prevLine.valiation_title == dataSchenario.valiation_title) {
            dataSchenario.valiation_title = '';
          }
          results.push(dataSchenario);
          prevLine = dataSchenario;
          break;
        }
      }
    }
    return results;
  }
}

class ScenarioDTablesSection {
  private _prevJson: IStep = {} as IStep;

  constructor(private variationAndScenarioCollection: VariationAndScenarioCollection) {}

  genarate(): IScenarioDTable[] {
    const results: IScenarioDTable[] = [];
    this._prevJson = this._newStepJson('', 0);
    for (const datum of this.variationAndScenarioCollection.data) {
      const ucDt = datum.ucDt;
      const ucDtJson = {
        valiation_id: datum.valiation.id.text,
        valiation_title: datum.valiation.description.text,
        scenario_id: datum.ucScenario.id.text,
        scenario_title: datum.ucScenario.description.text,
        scenario_type: convUcScenarioType(datum.ucScenario),
        step_link: convStepLink(datum.valiation, datum.ucScenario),
        countOfRules: ucDt.countOfRules,
        items: [],
      } as IScenarioDTable;
      this._prevJson = this._newStepJson('', ucDt.countOfRules);
      this._appendStepHeader('【事前条件】', ucDt.countOfRules, ucDtJson);
      for (const step of ucDt.preConditionSteps) {
        const stepJson = this._newStepJson(step.id.text, ucDt.countOfRules);
        stepJson.operation_desc = step.entryPoint.description.text;
        this._updateConditionRow(stepJson, step);
        this._eraseSameTextAsPrevLine(stepJson);
        ucDtJson.items.push(stepJson);
      }
      this._appendStepHeader('【手順】', ucDt.countOfRules, ucDtJson);
      for (const step of ucDt.steps) {
        const stepJson = this._newStepJson(step.id.text, ucDt.countOfRules);
        if (step.stepType == UcScenarioStepType.ActorOperation) {
          stepJson.operation_desc = step.entryPoint.description.text;
        } else if (step.stepType == UcScenarioStepType.Expected) {
          stepJson.expected_desc = step.entryPoint.description.text;
        }
        this._updateConditionRow(stepJson, step);
        this._eraseSameTextAsPrevLine(stepJson);
        ucDtJson.items.push(stepJson);
      }
      let resultHeader = false;
      for (const resultRow of ucDt.decisionTable.resultRows) {
        for (const vp of resultRow.result.verificationPoints) {
          if (!(vp instanceof PostCondition)) {
            continue;
          }
          if (!resultHeader) {
            this._appendStepHeader('【事後条件】', ucDt.countOfRules, ucDtJson);
            resultHeader = true;
          }
          const stepJson = this._newStepJson(vp.id.text, ucDt.countOfRules);
          stepJson.expected_desc = resultRow.result.desc.text;
          stepJson.factor_select_rules = resultRow.rules.map(x =>
            x == DTResultRuleChoice.Check ? 'X' : x == DTResultRuleChoice.None ? ' ' : '不明'
          );
          stepJson.factor_desc = vp.description.text;
          stepJson.factor_colspan = 2;
          this._eraseSameTextAsPrevLine(stepJson);
          ucDtJson.items.push(stepJson);
        }
      }
      results.push(ucDtJson);
    }
    return results;
  }

  private _newStepJson(stepIdText: string, countOfRules: number): IStep {
    return {
      step_colspan: 1,
      step_id: stepIdText,
      operation_desc: '',
      expected_desc: '',
      factor_desc: '',
      factor_select_item: '',
      factor_select_rules: Array(countOfRules).fill(' '),
      factor_colspan: 1,
    } as IStep;
  }

  private _appendStepHeader(headText: string, countOfRules: number, ucDtJson: IScenarioDTable) {
    const header = this._newStepJson(headText, countOfRules);
    header.step_colspan = 5 + countOfRules;
    ucDtJson.items.push(header);
    this._prevJson = this._newStepJson(headText, countOfRules);
  }

  private _updateConditionRow(stepJson: IStep, step: UcScenarioStep) {
    if (step.conditionRow) {
      const conditionRow = step.conditionRow;
      stepJson.factor_desc = conditionRow.factor.name.text;
      stepJson.factor_select_item = conditionRow.level.text;
      stepJson.factor_select_rules = conditionRow.rules.map(x =>
        x == DTConditionRuleChoice.Yes ? 'Y' : x == DTConditionRuleChoice.No ? 'N' : ' '
      );
    }
  }

  private _eraseSameTextAsPrevLine(stepJson: IStep) {
    if (this._prevJson.operation_desc == stepJson.operation_desc) {
      stepJson.operation_desc = '';
    } else {
      this._prevJson.operation_desc = stepJson.operation_desc;
    }
    if (this._prevJson.expected_desc == stepJson.expected_desc) {
      stepJson.expected_desc = '';
    } else {
      this._prevJson.expected_desc = stepJson.expected_desc;
    }
    if (this._prevJson.factor_desc == stepJson.factor_desc) {
      stepJson.factor_desc = '';
    } else {
      this._prevJson.factor_desc = stepJson.factor_desc;
    }
  }
}

function convUcScenarioType(ucScenario: UcScenario): string {
  return ucScenario.ucScenarioType == UcScenarioType.BasicFlowScenario
    ? '基本フローの検証'
    : ucScenario.ucScenarioType == UcScenarioType.AlternateFlowScenario
    ? `代替フロー(${ucScenario.altExFlow?.id.text})の検証`
    : ucScenario.ucScenarioType == UcScenarioType.ExceptionFlowScenario
    ? `例外フロー(${ucScenario.altExFlow?.id.text})の検証`
    : '不明';
}

function convStepLink(valiation: Valiation, ucScenario: UcScenario): string {
  return valiation.id.text + '_' + ucScenario.id.text;
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
      scenarios.push({
        scenario_id: o.id.text,
        scenario_type: convUcScenarioType(o),
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
    const variationAndScenarioCollection = makeVariationAndScenarioCollection(ucAllScenario, uc);
    const dataVariationScenarioSection = new DataVariationScenarioSection(variationAndScenarioCollection);
    const scenarioDTablesSection = new ScenarioDTablesSection(variationAndScenarioCollection);
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
      data_scenarios: dataVariationScenarioSection.generate(),
      scenario_dtables: scenarioDTablesSection.genarate(),
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

        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title class="text-h6">
                テストデータ
              </v-card-title>
              <v-card-subtitle>
                テストに使用するデータとテストを実施するフローの組み合わせ
              </v-card-subtitle>
              <v-card-text>
                <v-data-table dense :items="app.data_scenarios" :disable-sort="true" class="app-vert-stripes" fixed-header
                  disable-pagination hide-default-footer>

                  <template v-slot:header>
                    <thead>
                      <tr>
                        <th>データID</th>
                        <th>説明</th>
                        <th>因子水準</th>
                        <th v-for="sid in app.scenario_ids">
                          {{ sid }}
                        </th>
                      </tr>
                    </thead>
                  </template>

                  <template v-slot:body="{ items }">
                    <tbody>
                      <tr v-for="(item, rowIndex) in items" :key="rowIndex">
                        <template>
                          <td>{{ item.valiation_id }}</td>
                          <td>{{ item.valiation_title }}</td>
                          <td>{{ item.factors_text }}</td>
                          <td v-for="(choice, i) in item.scenario_used"><a :href="item.step_link">{{ choice }}</a></td>
                        </template>
                      </tr>
                    </tbody>
                  </template>

                </v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <v-row v-for="scenario_dt in app.scenario_dtables" :key="rowIndex">
          <a :name="scenario_dt.step_link"></a>
          <v-col cols="12">
            <v-card>
              <v-card-text>テスト手順</v-card-subtitle>
              <v-card-title class="text-h6">
                {{ scenario_dt.valiation_id }} ＞ {{ scenario_dt.scenario_id }}
              </v-card-title>
              <v-card-subtitle>
                テストに使用するデータ: [{{ scenario_dt.valiation_id }}] {{ scenario_dt.valiation_title }}<br/>
                テストを実施するフロー: [{{ scenario_dt.scenario_id }}] {{ scenario_dt.scenario_type }} / {{ scenario_dt.scenario_title }}
              </v-card-subtitle>
              <v-card-text>
                <v-data-table dense :items="scenario_dt.items" :disable-sort="true" class="app-vert-stripes" fixed-header
                  disable-pagination hide-default-footer>

                  <template v-slot:header>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>事前条件・手順</th>
                        <th>期待値</th>
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
                        <template v-if="item.step_colspan == 1">
                          <td>{{ item.step_id }}</td>
                          <td>{{ item.operation_desc }}</td>
                          <td>{{ item.expected_desc }}</td>
                          <td :colspan="item.factor_colspan">{{ item.factor_desc }}</td>
                          <td v-if="item.factor_colspan != 2">{{ item.factor_select_item }}</td>
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
                        </template>
                        <template v-if="item.step_colspan != 1">
                          <th :colspan="item.step_colspan">{{ item.step_id }}</th>
                        </template>
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
