pack-zipper
=================

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![GitHub license](https://img.shields.io/github/license/oclif/hello-world)](https://github.com/oclif/hello-world/blob/main/LICENSE)

* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Feature Request

feel free to open a new issue for new features! 

# Usage

```sh-session
$ npm install -g pack-zipper
$ pkzip COMMAND
running command...
$ pkzip (--version)
pack-zipper/2.0.0 win32-x64 node-v18.13.0
$ pkzip --help [COMMAND]
USAGE
  $ pkzip COMMAND
...
```
# Commands
* [`pkzip zip [FILE]`](#pkzip-zip-file)

## `pkzip zip [FILE]`

describe the command here

```
USAGE
  $ pkzip zip [FILE] -n <value> [-t <value>] [-d <value>] [-a <value>]

ARGUMENTS
  FILE  配置文件地址

FLAGS
  -d, --dist = <value>  文件目录
  -n, --name = <value>  (required) name to print
  -t, --type = <value>  压缩文件名称类型
  -a, --addition = <value>  附加在文件之后的额外信息

DESCRIPTION
  describe the command here

EXAMPLES
  $ pkzip zip
```

_See code: [dist/commands/zip.ts](https://github.com/alfxjx/pack-zipper/blob/v2.0.0/dist/commands/zip.ts)_
