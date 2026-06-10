import { Args, Command, Flags, ux, Interfaces } from '@oclif/core'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import moment from 'moment'

const NAME_VERSION_REGEX = /^[\w.-]+$/
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024
const MAX_DEPTH = 20
const WINDOWS_PREFIX = '_Windows_'

interface IResolvedMetadata {
  name: string
  version: string
  branch: string
  commit: string
  buildTime: string
}

interface IZipResult {
  source: string
  outputPath: string
  fileCount: number
  totalBytes: number
  warnings: string[]
}

type ZipFlags = Interfaces.InferredFlags<typeof Zip.flags>

export default class Zip extends Command {
  static description = '将构建产物目录压缩为带版本号的 zip(产物名兼容 Windows 命名)'

  static examples = [
    '<%= config.bin %> zip ./dist/myapp',
    '<%= config.bin %> zip ./dist/myapp --version 1.2.3',
    '<%= config.bin %> zip ./dist/myapp --output ./release --clean --no-git',
  ]

  static flags = {
    name: Flags.string({ char: 'n', description: '产物名(默认从 SOURCE/package.json 取 "name")' }),
    version: Flags.string({ char: 'v', description: '版本号(默认从 SOURCE/package.json 取 "version")' }),
    'build-time': Flags.string({ description: '构建时间,ISO 格式字符串(默认当前时间)' }),
    branch: Flags.string({ description: 'git 分支(默认 git rev-parse --abbrev-ref HEAD)' }),
    commit: Flags.string({ description: 'git commit(默认 git rev-parse --short HEAD)' }),
    type: Flags.string({ char: 't', description: '文件名模式:version=含版本号与时间,其他=仅时间戳', default: 'version' }),
    output: Flags.string({ char: 'o', description: 'zip 落点目录(默认 SOURCE 的父目录)' }),
    exclude: Flags.string({ multiple: true, description: '排除 glob 规则(可多次传)' }),
    clean: Flags.boolean({ description: '写入前清理 OUTPUT 目录下已存在的 zip' }),
    git: Flags.boolean({
      default: true,
      allowNo: true,
      description: '从 git 推断 branch/commit,--no-git 时退化为 "unknown"',
    }),
    pkg: Flags.boolean({
      default: true,
      allowNo: true,
      description: '从 SOURCE/package.json 推断 name/version,--no-pkg 时需显式 --name --version',
    }),
  }

  static args = {
    source: Args.string({ description: '要打包的源目录', default: './dist' }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Zip)
    const source = path.resolve(args.source)
    this.assertSourceDirectory(source)

    const label = flags.name ?? path.basename(source)
    await ux.action.start(`压缩: ${label}`)
    try {
      const result = await this.doZip(source, flags)
      await ux.action.stop('压缩完成')
      for (const w of result.warnings) this.warn(w)
      this.log(`  源:   ${result.source}`)
      this.log(`  输出: ${result.outputPath}`)
      this.log(`  文件: ${result.fileCount} 个,共 ${(result.totalBytes / 1024 / 1024).toFixed(2)} MB`)
    } catch (error) {
      await ux.action.stop('失败')
      throw error
    }
  }

  private assertSourceDirectory(source: string): void {
    let stat: fs.Stats
    try {
      stat = fs.statSync(source)
    } catch (error) {
      const e = error as NodeJS.ErrnoException
      if (e.code === 'ENOENT') {
        throw new Error(`源目录不存在: ${source}`)
      }

      throw error
    }

    if (!stat.isDirectory()) {
      throw new Error(`源路径不是目录: ${source}`)
    }
  }

  private inferFromPackageJson(source: string, enabled: boolean): { name?: string; version?: string } {
    if (!enabled) return {}
    const pkgPath = path.join(source, 'package.json')
    if (!fs.existsSync(pkgPath)) return {}
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: unknown; version?: unknown }
      const result: { name?: string; version?: string } = {}
      if (typeof pkg.name === 'string') result.name = pkg.name
      if (typeof pkg.version === 'string') result.version = pkg.version
      return result
    } catch (error) {
      const e = error as Error
      this.warn(`读取 ${pkgPath} 失败: ${e.message ?? e}`)
      return {}
    }
  }

  private inferFromGit(enabled: boolean): { branch: string; commit: string } {
    if (!enabled) return { branch: 'unknown', commit: 'unknown' }
    try {
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return { branch, commit }
    } catch {
      return { branch: 'unknown', commit: 'unknown' }
    }
  }

  private validateNameVersion(value: string, field: string): void {
    if (!NAME_VERSION_REGEX.test(value)) {
      throw new Error(`${field} 包含非法字符 "${value}",仅允许字母、数字、点、下划线、连字符`)
    }
  }

  private matchesExclude(relPosixPath: string, excludes: string[]): boolean {
    for (const pattern of excludes) {
      const re = new RegExp(
        '^' +
          pattern
            .replaceAll(/[$()+.[\\\]^{|}]/g, '\\$&')
            .replaceAll('**', '\u0000')
            .replaceAll('*', '[^/]*')
            .replaceAll('\0', '.*') +
          '$',
      )
      if (re.test(relPosixPath)) return true
    }

    return false
  }

  private buildFilename(meta: IResolvedMetadata, type: string): string {
    if (type === 'version') {
      const dateStr = moment(new Date(meta.buildTime)).format('YYYY-MM-DD-HH-mm-ss')
      return `${meta.name}${WINDOWS_PREFIX}${meta.version}_${dateStr}.zip`
    }

    const dateStr = moment(new Date(meta.buildTime)).format('YYYYMMDDHHmm')
    return `${meta.name}${WINDOWS_PREFIX}${dateStr}.zip`
  }

  private cleanOldZips(outputDir: string): number {
    if (!fs.existsSync(outputDir)) return 0
    let removed = 0
    for (const entry of fs.readdirSync(outputDir)) {
      if (entry.endsWith('.zip') && entry.includes(WINDOWS_PREFIX)) {
        fs.unlinkSync(path.join(outputDir, entry))
        removed++
      }
    }

    return removed
  }

  private walkIntoZip(
    source: string,
    zip: JSZip,
    excludes: string[],
  ): { fileCount: number; totalBytes: number; warnings: string[] } {
    const visited = new Set<string>()
    const warnings: string[] = []
    let fileCount = 0
    let totalBytes = 0

    const walk = (dir: string, depth: number): void => {
      if (depth > MAX_DEPTH) {
        warnings.push(`跳过超过 ${MAX_DEPTH} 层深度的目录: ${dir}`)
        return
      }

      let realpath: string
      try {
        realpath = fs.realpathSync(dir)
      } catch {
        return
      }

      if (visited.has(realpath)) {
        warnings.push(`跳过符号链接循环: ${dir}`)
        return
      }

      visited.add(realpath)

      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch (error) {
        const e = error as Error
        warnings.push(`无法读取目录 ${dir}: ${e.message ?? e}`)
        return
      }

      for (const name of entries) {
        const fullPath = path.join(dir, name)
        const relPath = path.relative(source, fullPath).split(path.sep).join('/')

        if (this.matchesExclude(relPath, excludes)) continue

        let stat: fs.Stats
        try {
          stat = fs.lstatSync(fullPath)
        } catch (error) {
          const e = error as Error
          warnings.push(`无法 stat ${fullPath}: ${e.message ?? e}`)
          continue
        }

        if (stat.isSymbolicLink()) {
          let target = ''
          try {
            target = fs.readlinkSync(fullPath)
          } catch (error) {
            const e = error as Error
            warnings.push(`无法读取符号链接 ${fullPath}: ${e.message ?? e}`)
          }

          zip.file(relPath, target, { unixPermissions: 0o12_0000 })
          continue
        }

        if (stat.isDirectory()) {
          walk(fullPath, depth + 1)
          continue
        }

        if (stat.size > MAX_FILE_SIZE_BYTES) {
          warnings.push(`跳过超过 ${MAX_FILE_SIZE_BYTES} 字节的文件: ${relPath}`)
          continue
        }

        let data: Buffer
        try {
          data = fs.readFileSync(fullPath)
        } catch (error) {
          const e = error as Error
          warnings.push(`无法读取文件 ${fullPath}: ${e.message ?? e}`)
          continue
        }

        zip.file(relPath, new Uint8Array(data))
        fileCount++
        totalBytes += stat.size
      }
    }

    walk(source, 0)
    return { fileCount, totalBytes, warnings }
  }

  private async doZip(source: string, flags: ZipFlags): Promise<IZipResult> {
    const outputDir = flags.output ? path.resolve(flags.output) : path.dirname(source)
    if (outputDir === source || outputDir.startsWith(source + path.sep)) {
      throw new Error(`输出目录不能在源目录内部: ${outputDir}`)
    }

    fs.mkdirSync(outputDir, { recursive: true })

    const fromPkg = this.inferFromPackageJson(source, flags.pkg)
    const fromGit = this.inferFromGit(flags.git)

    const name = flags.name ?? fromPkg.name
    const version = flags.version ?? fromPkg.version

    if (!name) {
      throw new Error('无法确定产物名:--name 未传,且 --no-pkg 或 package.json 中无 name 字段')
    }

    if (!version) {
      throw new Error('无法确定版本号:--version 未传,且 --no-pkg 或 package.json 中无 version 字段')
    }

    this.validateNameVersion(name, 'name')
    this.validateNameVersion(version, 'version')

    if (flags['build-time'] !== undefined && Number.isNaN(new Date(flags['build-time']).getTime())) {
      throw new TypeError(`--build-time 不是合法 ISO 时间: ${flags['build-time']}`)
    }

    const meta: IResolvedMetadata = {
      name,
      version,
      branch: flags.branch ?? fromGit.branch,
      commit: flags.commit ?? fromGit.commit,
      buildTime: flags['build-time'] ?? new Date().toISOString(),
    }

    if (flags.clean) {
      const removed = this.cleanOldZips(outputDir)
      if (removed > 0) this.log(`清理旧 zip: ${removed} 个`)
    }

    const zip = new JSZip()
    const excludes = flags.exclude ?? []
    const { fileCount, totalBytes, warnings } = this.walkIntoZip(source, zip, excludes)

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = this.buildFilename(meta, flags.type ?? 'version')
    const outputPath = path.join(outputDir, filename)
    fs.writeFileSync(outputPath, new Uint8Array(buffer))

    return { source, outputPath, fileCount, totalBytes, warnings }
  }
}
