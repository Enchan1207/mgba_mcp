# 日本版ポケモン赤・緑 ID → 名称データ

これらのJSONは、第一世代のゲーム内部で使用する **数値IDをキーにした日本語名称表** です。全国図鑑番号や現行作品の道具IDとは異なります。

- `species.json`：内部種族ID（1〜190）。`けつばん` は未定義IDとしてキーを省略。
- `moves.json`：技ID（1〜165）。
- `items.json`：道具ID（1〜83、一部未使用）、ひでんマシン（196〜200）、わざマシン（201〜250）。未使用のアイテムやエレベーター階層など、通常のバッグに含めるべきでない値は省略。

データソース：

- [日本版種族名](https://github.com/Narishma-gb/pokegreen/blob/master/data/pokemon/names.asm)
- [日本版技名](https://github.com/Narishma-gb/pokegreen/blob/master/data/moves/names.asm)
- [日本版道具名](https://github.com/Narishma-gb/pokegreen/blob/master/data/items/names.asm)
- [ID定義（TM/HMを含む）](https://github.com/Narishma-gb/pokegreen/blob/master/constants/item_constants.asm)

TM/HMの名前は、世代固有のID範囲から `わざマシン０１`、`ひでんマシン０１` などを生成して収録しています。未定義IDの名称は推測せず、読み出し側で `null` として扱います。
