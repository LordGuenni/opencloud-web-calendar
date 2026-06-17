import openCloudConfig from '@opencloud-eu/eslint-config'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'

export default [
  ...openCloudConfig,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
  },
]
