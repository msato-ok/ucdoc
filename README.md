# ucdoc

## example でテスト仕様書を生成する

```bash
# テスト仕様書
npx ts-node src/cli.ts uctest -o example/output example/usecase.yml example/common.yml

# ユースケース記述
npx ts-node src/cli.ts usecase -o example/output example/usecase.yml example/common.yml
```

### example の生成結果

- テスト仕様書
    - <a href="example/output/UC01.html">example/output/UC01.html</a>
- ユースケース記述
    - <a href="example/output/UC01.md">example/output/UC01.md</a>

## build

```bash
npm run build
```

## husky の有効化

```bash
npx husky install
```

## デバッグ

```bash
npx ts-node src/cli.ts usecase -o example/output example/usecase.yml example/common.yml
```

## issue

- 代替フローと例外フローは、基本フローを extends する形式になっているが、飛び石状態のフローが正しく継らない問題がある
