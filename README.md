# ucdoc

## husky の有効化

```bash
npx husky install
```

## デバッグ

```bash
npx ts-node src/cli.ts usecase -o ./out usecase1.yml usecase2.yml
```

## issue

- 代替フローと例外フローは、基本フローを extends する形式になっているが、飛び石状態のフローが正しく継らない問題がある
