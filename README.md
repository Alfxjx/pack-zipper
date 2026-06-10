pack-zipper
=================

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

将构建产物目录压缩为带版本号的 Windows 命名 zip。支持从 `package.json` 和 `git` 自动推断产物名、版本号、分支与 commit。

* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

```sh-session
$ npm install -g pack-zipper
$ pkzip COMMAND
running command...
$ pkzip --version
pack-zipper/3.0.0-beta.1 win32-x64 node-v18.0.0
$ pkzip --help [COMMAND]
USAGE
  $ pkzip COMMAND
...
```

# Commands

## `pkzip zip [SOURCE]`

将 SOURCE 目录递归压缩为 zip。SOURCE 是位置参数,默认为 `./dist`。
元数据(name / version / buildTime / branch / commit)由 CLI 参数传入,缺省时从 `SOURCE/package.json` 和当前目录的 git 仓库自动推断。

```
USAGE
  $ pkzip zip [SOURCE] [-n <value>] [-v <value>] [--build-time <value>] [--branch <value>] [--commit <value>] [-t <value>] [-o <value>] [--exclude <value>] [--clean] [--git] [--pkg]

ARGUMENTS
  SOURCE  [default: ./dist] 要打包的源目录

FLAGS
  -n, --name=<value>        产物名(默认从 SOURCE/package.json 取 "name")
  -v, --version=<value>     版本号(默认从 SOURCE/package.json 取 "version")
      --build-time=<value>  构建时间,ISO 格式字符串(默认当前时间)
      --branch=<value>      git 分支(默认 git rev-parse --abbrev-ref HEAD)
      --commit=<value>      git commit(默认 git rev-parse --short HEAD)
  -t, --type=<value>        [default: version] 文件名模式:version=含版本号与时间,其他=仅时间戳
  -o, --output=<value>      zip 落点目录(默认 SOURCE 的父目录)
      --exclude=<value>...  排除 glob 规则(可多次传)
      --clean               写入前清理 OUTPUT 目录下已存在的 zip
      --[no-]git            从 git 推断 branch/commit,--no-git 时退化为 "unknown"
      --[no-]pkg            从 SOURCE/package.json 推断 name/version,--no-pkg 时需显式 --name --version

DESCRIPTION
  将构建产物目录压缩为带版本号的 zip(产物名兼容 Windows 命名)

EXAMPLES
  $ pkzip zip ./dist/myapp
  $ pkzip zip ./dist/myapp --version 1.2.3
  $ pkzip zip ./dist/myapp --output ./release --clean --no-git
```

**输出文件名**(与 2.x 兼容):
- `--type=version`(默认):`<name>_Windows_<version>_<YYYY-MM-DD-HH-mm-ss>.zip`
- 其他:`<name>_Windows_<YYYYMMDDHHmm>.zip`

**安全约束**:
- `--name` / `--version` 仅允许字母、数字、点、下划线、连字符(`/\\..` 等字符会被拒绝)
- 符号链接不会被跟随,只存为 symlink 条目
- 递归有 cycle 防护、深度上限(20 层)、单文件大小上限(200 MB)
- `--output` 不能位于 SOURCE 内部(否则写入的 zip 会被下次运行卷入)
