languageId null null
blockCommentRegex /(?:^(?!\s*$).+\n?)+/gm
[
  { token: 'file', value: 'start$', string: '@file start$', end: 56 },
  {
    token: 'regex',
    value: '^(?:(?!#)|$)',
    string: '@regex ^(?:(?!#)|$)',
    end: 56
  },
  { token: 'flags', value: '', string: '@flags', end: 56 },
  {
    token: 'replace',
    value: '#!sh\n',
    string: '@replace #!sh\n',
    end: 56
  },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 67 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'regex',
    value: '^(?:(?!#)|$)',
    string: '@regex ^(?:(?!#)|$)',
    end: 169
  },
  { token: 'flags', value: '', string: '@flags', end: 169 },
  {
    token: 'replace',
    value: '#!sh\nቃ',
    string: '@replace #!sh\nቃ',
    end: 169
  },
  { token: 'endregex', value: '', string: '@endregex', end: 169 },
  {
    token: 'regex',
    value: '^(#!sh\\n)ቃ',
    string: '@regex ^(#!sh\\n)ቃ',
    end: 169
  },
  { token: 'flags', value: '', string: '@flags', end: 169 },
  { token: 'replace', value: '$1', string: '@replace $1', end: 169 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 169 },
  { token: '!reset', value: undefined, end: undefined },
  { token: 'name', value: 'a', string: '@name a', end: 234 },
  { token: 'file', value: '\\.py$', string: '@file \\.py$', end: 234 },
  {
    token: 'regex',
    value: '(?<=[^\\s])  #',
    string: '@regex (?<=[^\\s])  #',
    end: 234
  },
  { token: 'replace', value: ' #', string: '@replace  #', end: 234 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 234 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'trin ending spaces',
    string: '@name trin ending spaces',
    end: 308
  },
  { token: 'file', value: '', string: '@file ', end: 308 },
  {
    token: 'regex',
    value: ' +(?<!@file )$',
    string: '@regex  +(?<!@file )$',
    end: 308
  },
  { token: 'replace', value: '', string: '@replace', end: 308 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 308 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'trin end lines',
    string: '@name trin end lines',
    end: 452
  },
  {
    token: 'file',
    value: '\\.nix$',
    string: '@file \\.nix$',
    end: 452
  },
  {
    token: 'regex',
    value: '^\\n+([}\\]])',
    string: '@regex ^\\n+([}\\]])',
    end: 452
  },
  { token: 'replace', value: '$1', string: '@replace $1', end: 452 },
  { token: 'endregex', value: '', string: '@endregex', end: 452 },
  {
    token: 'name',
    value: 'trin start lines',
    string: '@name trin start lines',
    end: 452
  },
  {
    token: 'file',
    value: '\\.nix$',
    string: '@file \\.nix$',
    end: 452
  },
  {
    token: 'regex',
    value: '([{[])\\n{2,}',
    string: '@regex ([{[])\\n{2,}',
    end: 452
  },
  {
    token: 'replace',
    value: '$1\n',
    string: '@replace $1\n',
    end: 452
  },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 463 },
  { token: '!reset', value: undefined, end: undefined },
  { token: 'name', value: 'no bin', string: '@name no bin', end: 562 },
  {
    token: 'file',
    value: '\\.sh|/[^/.]+$',
    string: '@file \\.sh|/[^/.]+$',
    end: 562
  },
  {
    token: 'regex',
    value: '^(?:# )?#!/bin/(\\w+)',
    string: '@regex ^(?:# )?#!/bin/(\\w+)',
    end: 562
  },
  {
    token: 'replace',
    value: '#!/usr/bin/env $1',
    string: '@replace #!/usr/bin/env $1',
    end: 562
  },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 562 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'file',
    value: '\\.sh|/[^/.]+$',
    string: '@file \\.sh|/[^/.]+$',
    end: 643
  },
  {
    token: 'regex',
    value: '#!((?:ba|z)?sh)',
    string: '@regex #!((?:ba|z)?sh)',
    end: 643
  },
  {
    token: 'replace',
    value: '#!/usr/bin/env $1',
    string: '@replace #!/usr/bin/env $1',
    end: 643
  },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 643 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'use with',
    string: '@name use with',
    end: 1156
  },
  {
    token: 'file',
    value: '\\.nix$',
    string: '@file \\.nix$',
    end: 1156
  },
  {
    token: 'regex',
    value: '\\[\\n *(\\(?[\\w\\-_]+)\\..*\\n(\\s*\\1\\.\\(?[\\w\\-_]+)+\\n *\\];',
    string: '@regex \\[\\n *(\\(?[\\w\\-_]+)\\..*\\n(\\s*\\1\\.\\(?[\\w\\-_]+)+\\n *\\];',
    end: 1156
  },
  {
    token: 'replace',
    value: 'with $1; $&',
    string: '@replace with $1; $&',
    end: 1156
  },
  { token: 'endregex', value: '', string: '@endregex', end: 1156 },
  {
    token: 'regex',
    value: '(with ([\\w\\-_]+); \\[\\n(?:\\s*(?!\\(\\2\\.)(?!\\2\\.)\\S+\\n)*\\s*)(?:(\\()?\\2)\\.([\\w\\-_]+)',
    string: '@regex (with ([\\w\\-_]+); \\[\\n(?:\\s*(?!\\(\\2\\.)(?!\\2\\.)\\S+\\n)*\\s*)(?:(\\()?\\2)\\.([\\w\\-_]+)',
    end: 1156
  },
  { token: 'untilfail', value: '', string: '@untilfail', end: 1156 },
  {
    token: 'replace',
    value: '$1$3$4',
    string: '@replace $1$3$4',
    end: 1156
  },
  { token: 'endregex', value: '', string: '@endregex', end: 1156 },
  {
    token: 'regex',
    value: 'ps:\\s*\\[\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)\\]',
    string: '@regex ps:\\s*\\[\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)\\]',
    end: 1156
  },
  {
    token: 'replace',
    value: 'ps: with ps; [\n$1$2\n$3$4\n$5]',
    string: '@replace ps: with ps; [\n$1$2\n$3$4\n$5]',
    end: 1156
  },
  { token: 'endregex', value: '', string: '@endregex', end: 1156 },
  {
    token: 'regex',
    value: '\\[(\\s*\\n\\s*)(?:(\\([\\s\\S]*?\\))(\\s*\\n\\s*))?pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)\\];',
    string: '@regex \\[(\\s*\\n\\s*)(?:(\\([\\s\\S]*?\\))(\\s*\\n\\s*))?pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)\\];',
    end: 1156
  },
  {
    token: 'replace',
    value: 'with pkgs; [$1$2$3$4$5$6$7];',
    string: '@replace with pkgs; [$1$2$3$4$5$6$7];',
    end: 1156
  },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 1156 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'same line return',
    string: '@name same line return',
    end: 1304
  },
  { token: 'file', value: '\\.gd$', string: '@file \\.gd$', end: 1304 },
  {
    token: 'regex',
    value: ':\\s*(return|continue|break|pass)(\\s*(true|false|null|\\d+)?)$',
    string: '@regex :\\s*(return|continue|break|pass)(\\s*(true|false|null|\\d+)?)$',
    end: 1304
  },
  {
    token: 'replace',
    value: ': $1$2',
    string: '@replace : $1$2',
    end: 1304
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1304 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 1304 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'python to gd casing',
    string: '@name python to gd casing',
    end: 1457
  },
  { token: 'file', value: '\\.gd$', string: '@file \\.gd$', end: 1457 },
  {
    token: 'regex',
    value: '\\bTrue\\b',
    string: '@regex \\bTrue\\b',
    end: 1457
  },
  {
    token: 'replace',
    value: 'true',
    string: '@replace true',
    end: 1457
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1457 },
  { token: 'endregex', value: '', string: '@endregex', end: 1457 },
  { token: 'file', value: '\\.gd$', string: '@file \\.gd$', end: 1457 },
  {
    token: 'regex',
    value: '\\bFalse\\b',
    string: '@regex \\bFalse\\b',
    end: 1457
  },
  {
    token: 'replace',
    value: 'false',
    string: '@replace false',
    end: 1457
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1457 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 1457 },
  { token: '!reset', value: undefined, end: undefined },
  {
    token: 'name',
    value: 'python casing',
    string: '@name python casing',
    end: 1604
  },
  { token: 'file', value: '\\.py$', string: '@file \\.py$', end: 1604 },
  {
    token: 'regex',
    value: '\\btrue\\b',
    string: '@regex \\btrue\\b',
    end: 1604
  },
  {
    token: 'replace',
    value: 'True',
    string: '@replace True',
    end: 1604
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1604 },
  { token: 'endregex', value: '', string: '@endregex', end: 1604 },
  { token: 'file', value: '\\.py$', string: '@file \\.py$', end: 1604 },
  {
    token: 'regex',
    value: '\\bfalse\\b',
    string: '@regex \\bfalse\\b',
    end: 1604
  },
  {
    token: 'replace',
    value: 'False',
    string: '@replace False',
    end: 1604
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1604 },
  { token: 'endregex', value: '\n', string: '@endregex\n', end: 1604 },
  { token: '!reset', value: undefined, end: undefined },
  { token: 'file', value: '\\.gd$', string: '@file \\.gd$', end: 1682 },
  {
    token: 'regex',
    value: 'Vector2\\(0, 0\\)',
    string: '@regex Vector2\\(0, 0\\)',
    end: 1682
  },
  {
    token: 'replace',
    value: 'Vector2.ZERO',
    string: '@replace Vector2.ZERO',
    end: 1682
  },
  { token: 'flags', value: 'gm', string: '@flags gm', end: 1682 },
  ... 124 more items
]
