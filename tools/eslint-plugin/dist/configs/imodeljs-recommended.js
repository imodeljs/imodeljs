/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
module.exports = {
  env: {
    "browser": true
  },
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:react/recommended"
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    "project": "tsconfig.json",
    "sourceType": "module"
  },
  plugins: [
    "@typescript-eslint",
    "react-hooks",
    "import",
    "prefer-arrow",
    "deprecation",
    "react"
  ],
  rules: {
    "@typescript-eslint/adjacent-overload-signatures": "error",
    "@typescript-eslint/array-type": "off", // TODO: May want to turn this on for consistency
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/class-name-casing": "off",
    "@typescript-eslint/camelcase": "off", // Using @typescript-eslint/naming-convention instead
    "@typescript-eslint/consistent-type-assertions": "error",
    "@typescript-eslint/consistent-type-definitions": "error",
    // Checks for return types of all methods so even wants void/Promise<void>.  Do we want to do that?
    // Otherwise we need to use `allowedTypedFunctionExpressions - false`. Could always do this for only tests.
    //
    // They are not going to allow void, at least for now, https://github.com/typescript-eslint/typescript-eslint/issues/50.
    // May want to fork and implement ourselves...
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-member-accessibility": [
      "error",
      {
        "accessibility": "explicit",
        "overrides": {
          "constructors": "off"
        }
      }
    ],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/indent": [
      "error",
      2
    ],
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/member-delimiter-style": [
      "error",
      {
        "multiline": {
          "delimiter": "semi",
          "requireLast": true
        },
        "singleline": {
          "delimiter": "comma",
          "requireLast": false
        }
      }
    ],
    "@typescript-eslint/member-ordering": "off",
    "@typescript-eslint/naming-convention": [
      "error",
      {
        "selector": "default",
        "format": ["camelCase"],
        "leadingUnderscore": "allow",
        "trailingUnderscore": "allow"
      },
      {
        "selector": "variable",
        "format": ["camelCase", "UPPER_CASE"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "memberLike",
        "modifiers": ["static"],
        "format": ["camelCase", "UPPER_CASE"],
      },
      {
        "selector": "memberLike",
        "modifiers": ["static", "public"],
        "format": ["camelCase", "UPPER_CASE"],
      },
      {
        "selector": "memberLike",
        "modifiers": ["private"],
        "format": ["camelCase"],
        "leadingUnderscore": "require"
      },
      {
        "selector": "memberLike",
        "modifiers": ["static", "private"],
        "format": ["camelCase", "UPPER_CASE"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "method",
        "modifiers": ["private"],
        "format": ["camelCase"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "memberLike",
        "modifiers": ["protected"],
        "format": ["camelCase"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "memberLike",
        "modifiers": ["public"],
        "format": ["camelCase"],
        "leadingUnderscore": "forbid"
      },
      {
        "selector": "typeLike",
        "format": ["PascalCase"],
        "leadingUnderscore": "forbid"
      },
      {
        "selector": "enumMember",
        "format": null,
        "leadingUnderscore": "allow"
      }
    ],
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-empty-interface": "error",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-implied-eval": "off",
    "@typescript-eslint/no-inferrable-types": "off",
    "@typescript-eslint/no-misused-new": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        "checksVoidReturn": false
      }
    ],
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-parameter-properties": "off",
    "@typescript-eslint/no-redeclare": [
      "error",
      {
        "ignoreDeclarationMerge": true,
      }
    ],
    "@typescript-eslint/no-shadow": [
      "error",
      {
        "hoist": "all",
        "allow": ["T", "args"]
      }
    ],
    "@typescript-eslint/return-await": "error",
    "@typescript-eslint/no-this-alias": "error",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "args": "after-used",
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
      }
    ],
    "@typescript-eslint/no-var-requires": "error",
    "@typescript-eslint/prefer-for-of": "error",
    "@typescript-eslint/prefer-function-type": "error",
    "@typescript-eslint/prefer-includes": "off",
    "@typescript-eslint/prefer-namespace-keyword": "error",
    "@typescript-eslint/prefer-regexp-exec": "off",
    "@typescript-eslint/prefer-string-starts-ends-with": "off",
    "@typescript-eslint/promise-function-async": "error",
    "@typescript-eslint/quotes": [
      "error",
      "double",
      {
        "avoidEscape": true,
        "allowTemplateLiterals": true
      }
    ],
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/semi": [
      "error",
      "always"
    ],
    "@typescript-eslint/space-before-function-paren": [
      "error",
      {
        "anonymous": "always",
        "named": "never",
        "asyncArrow": "always"
      }
    ],
    "@typescript-eslint/triple-slash-reference": "error",
    "@typescript-eslint/type-annotation-spacing": "error",
    "@typescript-eslint/typedef": "off",
    // TODO: We have assignments of unbound methods all over the place.  There's a github issue open to fix this: https://github.com/typescript-eslint/typescript-eslint/issues/1256
    "@typescript-eslint/unbound-method": [
      "error",
      {
        "ignoreStatic": true
      }
    ],
    "@typescript-eslint/unified-signatures": "error",
    "arrow-body-style": "off",
    "arrow-parens": "error",
    "brace-style": [
      "error",
      "1tbs",
      {
        "allowSingleLine": true
      }
    ],
    "camelcase": "off", // Using @typescript-eslint/naming-convention instead
    "comma-dangle": [
      "error",
      "always-multiline"
    ],
    "complexity": "off",
    "constructor-super": "error",
    "curly": [
      "off",
      "multi-line"
    ],
    "deprecation/deprecation": "error",
    "dot-notation": "error",
    "eol-last": "error",
    "eqeqeq": [
      "error",
      "smart"
    ],
    "guard-for-in": "error",
    "id-blacklist": [
      "error",
      "any",
      "number",
      "string",
      "boolean",
      "Undefined"
    ],
    "id-match": "error",
    "import/no-deprecated": "off", // using deprecation/deprecation instead
    "import/no-duplicates": "off", // using no-duplicate-imports instead
    "import/order": "off",
    "indent": "off",  // note you must disable the base rule as it can report incorrect errors
    "max-classes-per-file": "off",
    "max-len": "off",
    "new-parens": "error",
    "no-bitwise": "off",
    "no-caller": "error",
    "no-cond-assign": "off",
    "no-console": "error",
    "no-debugger": "error",
    "no-duplicate-imports": "error",
    "no-empty": "off",
    "no-eval": "error",
    "no-fallthrough": "error",
    "no-invalid-this": "off",
    "no-multiple-empty-lines": ["error", { max: 1 }],
    "no-new-wrappers": "error",
    "no-redeclare": "off", // using @typescript-eslint/no-redeclare instead
    "no-restricted-properties": [
      "error", {
        "object": "Math",
        "property": "hypot",
        "message": "Use Geometry.hypotenuse methods instead",
      }
    ],
    "no-restricted-syntax": ["error", { selector: "TSEnumDeclaration[const=true]", message: "const enums are not allowed" }],
    "no-return-await": "off", // using @typescript-eslint/return-await instead
    "no-shadow": "off", // using @typescript-eslint/no-shadow instead
    "no-sparse-arrays": "error",
    "no-template-curly-in-string": "error",
    "no-throw-literal": "error",
    "no-trailing-spaces": "error",
    "no-undef-init": "error",
    // TODO: The current implementation does not support the configurations we want to allow.  Need to have it extended...
    "no-underscore-dangle": [
      "off",
      {
        "allowAfterThis": true,
        "allowAfterThisConstructor": true,
        "enforceInMethodNames": true
      }
    ],
    "no-unsafe-finally": "error",
    "no-unused-expressions": "off",
    "no-unused-labels": "error",
    "no-unused-vars": "off", // Using @typescript-eslint/no-unused-vars instead
    "no-var": "error",
    "object-shorthand": "error",
    "one-var": [
      "off",
      "never"
    ],
    // TODO: I'd like to enable this but will cause a lot of breaking changes
    "prefer-arrow/prefer-arrow-functions": [
      "off",
      {
        "disallowPrototype": true,
        "singleReturnOnly": false,
        "classPropertiesAllowed": false
      }
    ],
    "prefer-const": "error",
    "prefer-rest-params": "off",
    "prefer-spread": "off",
    "prefer-template": "error",
    "quote-props": [
      "error",
      "consistent-as-needed"
    ],
    "quotes": "off", // Using @typescript-eslint/quotes instead
    "radix": "error",
    "react/prop-types": "off",
    "sort-imports": [
      "error",
      {
        "ignoreDeclarationSort": true,
        "ignoreCase": true,
      }
    ],
    "spaced-comment": [
      "error",
      "always",
      {
        "exceptions": [
          "-", // Ignore a '-' immediately after '/*' to allow our copyright header standard
          "=",
          "*",
        ],
        "markers": [
          "/",
        ]
      }
    ],
    "use-isnan": "error",
    "valid-typeof": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "@bentley/import-spacing": ["error", {
      "allow-line-breaks": false, // line breaks not allowed
      "allow-line-breaks-inside-brackets": true, // except inside brackets
      // valid example: import {
      //   classA, classB,
      //   classC
      // } from "module";
      //
      // invalid example: import
      // { classA, classB }
      // from
      // "module";
    }],
    "@bentley/import-within-package": "error",
    "@bentley/prefer-get": "error",
    "@bentley/react-set-state-usage": ["error", { "updater-only": false, "allow-object": true }],
    "@bentley/require-basic-rpc-values": "off",
  },
  settings: {
    "react": {
      "version": "16.8"
    }
  }
}