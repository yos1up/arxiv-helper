# arxiv-helper

arXiv の論文を快適に読めるようになる UserScript

- 著者の h-index と所属の表示


<img src="./scrshot.png" width=640>

## Usage

1. Chrome Extension の Tampermonkey をインストール

2. `./UserScript/main.js` を Tampermonkey に追加する（「新規スクリプトを追加」 → 出てきた編集画面にスクリプトをコピペ → 保存）

3. `https://arxiv.org/list/stat.ML/` で始まるページ（例えば `https://arxiv.org/list/stat.ML/recent` ）で動作します．ページを表示してから h-index 値などが表示されるまで 30 秒程度時間がかかる場合があります．

## 内部構成

```
client <-------> GAS <-------> Spreadsheet
```
