import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    nursery: 'error',
  },
  env: {
    node: true,
    builtin: true,
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'vitest'],
  jsPlugins: [
    {
      name: 'simple-import-sort',
      specifier: 'eslint-plugin-simple-import-sort',
    },
  ],
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',

    'capitalized-comments': 'off',
    'no-warning-comments': 'off',
    'oxc/no-async-await': 'off',
    'no-magic-numbers': 'off',
    'no-undefined': 'off',
    'typescript/prefer-readonly-parameter-types': 'off',
    'import/unambiguous': 'off',
    'unicorn/numeric-separators-style': 'off',
    'max-classes-per-file': 'off',
    'import/max-dependencies': 'off',
    'max-statements': 'off',
    'arrow-body-style': 'off',
    'vitest/no-commented-out-tests': 'off',
    'oxc/no-rest-spread-properties': 'off',
    'typescript/no-unsafe-type-assertion': 'off',
    'oxc/no-optional-chaining': 'off',
    'no-ternary': 'off',
    'max-lines-per-function': 'off',
    'prefer-destructuring': 'off',
    'import/no-namespace': 'off',
    'max-lines': 'off',
    'unicorn/no-array-reduce': 'off',
    'unicorn/prefer-global-this': 'off',
    'vitest/require-hook': 'off',
    'one-var': 'off',
    'non-nullable-type-assertion-style': 'off',

    'no-continue': 'off',

    // require-await と衝突する
    'typescript/promise-function-async': 'off',

    'import/no-unassigned-import': [
      'error',
      {
        // dotenv/config のみをimportしたいケースがある
        allow: ['dotenv/config'],
      },
    ],

    'no-duplicate-imports': [
      'error',
      {
        allowSeparateTypeImports: true,
      },
    ],

    'import/no-default-export': 'off',
    'import/no-named-export': 'off',
    'import/no-nodejs-modules': 'off',
    'import/prefer-default-export': 'off',
    'import/exports-last': 'off',
    'import/group-exports': 'off',
    'import/no-relative-parent-imports': 'off',

    // これを禁止する理由はない
    'typescript/no-empty-interface': 'off',

    // organize import と衝突するうえ、常にautofixできるとも限らないため、価値が薄い
    'sort-imports': 'off',

    // オブジェクトのキー順に意味を持たせたいケースがある
    'sort-keys': 'off',

    'unicorn/max-nested-calls': [
      'error',
      {
        max: 4,
      },
    ],
    'unicorn/no-array-callback-reference': 'off',

    'id-length': [
      'error',
      {
        // 型パラメータ T を使いたい
        checkGeneric: false,
        exceptions: [
          // Zod
          'z',
          // Hono context
          'c',
        ],
      },
    ],

    // 同一構造のinterfaceを別名で定義したいことがある
    '@typescript-eslint/no-empty-object-type': 'off',

    // typeとinterfaceの選択をlinterに区別させたくないケースがある
    'typescript/consistent-type-definitions': 'off',

    // 戻り値の型が極端に長くなることがある
    'typescript/explicit-module-boundary-types': 'off',
    'typescript/explicit-function-return-type': 'off',

    // andThrough, orThroughでnullを返したいケースがある
    'no-null': 'off',

    // 機械的にundefinedリテラルを消去すべきではない
    'unicorn/no-useless-undefined': 'off',

    // 今回は特に禁止しない
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['packages/infra/**/*.ts'],
      rules: {
        // スタックインスタンスの初期化だけを行いたいケースがある
        'no-new': 'off',

        // `import type` と値importを分けることがある
        'import/no-duplicates': 'off',
        'no-duplicate-imports': 'off',

        // CDK の Construct 初期化は長くなりやすい
        'max-lines-per-function': 'off',

        'no-console': 'off',
        'vitest/require-hook': 'off',
      },
    },
    {
      files: ['**/*.test.ts'],
      rules: {
        // 1test-1expect強制
        'vitest/max-expects': [
          'error',
          {
            max: 1,
          },
        ],

        // 常にtest()を使う
        'vitest/consistent-test-it': [
          'error',
          {
            fn: 'test',
            withinDescribe: 'test',
          },
        ],

        // タイムアウトはなくてもよい
        'vitest/require-test-timeout': 'off',

        // hookを使いたい
        'vitest/no-hooks': 'off',

        // .toBe(boolean) を使う
        'vitest/prefer-strict-boolean-matchers': 'error',
        'vitest/prefer-to-be-truthy': 'off',
        'vitest/prefer-to-be-falsy': 'off',

        // .toHaveBeenCalledTimes(n) を使う
        'vitest/prefer-called-once': 'off',
        'vitest/prefer-called-times': 'error',

        // テストケースは長くなってもよい
        'max-lines-per-function': 'off',

        // アサーションは必須ではない
        'vitest/prefer-expect-assertions': 'off',

        // 別にテストケースの頭文字は小文字でいい
        'vitest/prefer-lowercase-title': 'off',

        // vitestの提供する値をimportする
        'vitest/no-importing-vitest-globals': 'off',

        // フックで後から初期化したいケースが多い
        'init-declarations': 'off',

        // テストケース名をlintで縛る理由はない
        'vitest/prefer-describe-function-title': 'off',
      },
    },
  ],
})
