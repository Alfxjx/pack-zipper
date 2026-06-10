import { expect } from 'chai'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use forward-slash paths in argv (oclif treats backslashes as JS escapes).
const toPosix = (p: string): string => p.split(path.sep).join('/')

// Use the native (backslash on Windows) form for child process cwd, since
// oclif needs to resolve commands relative to it.
const projectRoot = path.resolve(__dirname, '../..')
const bin = path.join(projectRoot, 'bin/run.js')

const fixtureRoot = path.resolve(__dirname, '../fixtures')
const fixtureRootPosix = toPosix(fixtureRoot)
const sampleWithPkg = `${fixtureRootPosix}/sample-with-pkg`
const sampleNoPkg = `${fixtureRootPosix}/sample-no-pkg`
const outputDir = `${fixtureRootPosix}/output`

interface IRunResult {
  stdout: string
  stderr: string
  status: number
}

function runZip(args: string[]): IRunResult {
  try {
    const stdout = execFileSync('node', [bin, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: projectRoot,
    })
    return { stdout, stderr: '', status: 0 }
  } catch (error) {
    const e = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number }
    return {
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : '',
      status: typeof e.status === 'number' ? e.status : 1,
    }
  }
}

function setupFixtures(): void {
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
  fs.mkdirSync(sampleWithPkg, { recursive: true })
  fs.writeFileSync(path.join(sampleWithPkg, 'package.json'), JSON.stringify({ name: 'sample-with-pkg', version: '2.0.0' }))
  fs.writeFileSync(path.join(sampleWithPkg, 'app.js'), 'console.log(2)')
  fs.writeFileSync(path.join(sampleWithPkg, 'index.html'), '<html></html>')

  fs.mkdirSync(sampleNoPkg, { recursive: true })
  fs.writeFileSync(path.join(sampleNoPkg, 'app.js'), 'console.log(1)')

  fs.mkdirSync(outputDir, { recursive: true })
}

function cleanupFixtures(): void {
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
}

function listZips(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.zip'))
}

describe('zip', () => {
  beforeEach(setupFixtures)
  afterEach(cleanupFixtures)

  it('uses inferred name/version from package.json', () => {
    const result = runZip(['zip', sampleWithPkg, '--output', outputDir, '--no-git'])
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).to.equal(0)
    const zips = listZips(outputDir)
    expect(zips).to.have.length(1)
    expect(zips[0]).to.match(/^sample-with-pkg_Windows_2(?:\.0){2}_\d{4}(?:-\d{2}){5}\.zip$/)
  })

  it('works with explicit --name and --version under --no-pkg', () => {
    const result = runZip([
      'zip',
      sampleNoPkg,
      '--output',
      outputDir,
      '--no-pkg',
      '--no-git',
      '--name',
      'manual-name',
      '--version',
      '0.1.0',
    ])
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).to.equal(0)
    const zips = listZips(outputDir)
    expect(zips).to.have.length(1)
    expect(zips[0]).to.match(/^manual-name_Windows_0\.1\.0_/)
  })

  it('fails with a clear message when name cannot be resolved', () => {
    const result = runZip(['zip', sampleNoPkg, '--output', outputDir, '--no-pkg', '--no-git', '--version', '0.1'])
    expect(result.status).to.not.equal(0)
    expect(result.stderr).to.contain('无法确定产物名')
  })

  it('rejects --name containing path traversal characters', () => {
    const result = runZip([
      'zip',
      sampleNoPkg,
      '--output',
      outputDir,
      '--no-pkg',
      '--no-git',
      '--name',
      '../etc',
      '--version',
      '0.1',
    ])
    expect(result.status).to.not.equal(0)
    expect(result.stderr).to.contain('包含非法字符')
  })

  it('errors when the source directory does not exist', () => {
    const missing = path.join(fixtureRoot, 'does-not-exist')
    const result = runZip(['zip', missing, '--output', outputDir, '--no-git'])
    expect(result.status).to.not.equal(0)
    expect(result.stderr).to.contain('源目录不存在')
  })

  it('errors when the source is a file, not a directory', () => {
    const filePath = path.join(sampleNoPkg, 'app.js')
    const result = runZip(['zip', filePath, '--output', outputDir, '--no-git'])
    expect(result.status).to.not.equal(0)
    expect(result.stderr).to.contain('源路径不是目录')
  })

  it('rejects --output that lives inside the source directory', () => {
    const result = runZip([
      'zip',
      sampleWithPkg,
      '--output',
      path.join(sampleWithPkg, 'nested'),
      '--no-git',
    ])
    expect(result.status).to.not.equal(0)
    expect(result.stderr).to.contain('输出目录不能在源目录内部')
  })

  it('uses non-version filename when --type is not "version"', () => {
    const result = runZip(['zip', sampleWithPkg, '--output', outputDir, '--no-git', '--type', 'plain'])
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).to.equal(0)
    const zips = listZips(outputDir)
    expect(zips).to.have.length(1)
    expect(zips[0]).to.match(/^sample-with-pkg_Windows_\d{12}\.zip$/)
  })

  it('cleans old zips when --clean is passed', () => {
    fs.writeFileSync(path.join(outputDir, 'sample-with-pkg_Windows_19990101000000.zip'), 'stale')
    const result = runZip(['zip', sampleWithPkg, '--output', outputDir, '--no-git', '--clean'])
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).to.equal(0)
    const zips = listZips(outputDir)
    expect(zips).to.have.length(1)
    expect(zips[0]).to.not.contain('19990101000000')
  })

  it('uses the provided --build-time in the filename', () => {
    const result = runZip(['zip', sampleWithPkg, '--output', outputDir, '--no-git', '--build-time', '2024-01-02T03:04:05Z'])
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).to.equal(0)
    const zips = listZips(outputDir)
    expect(zips).to.have.length(1)
    // Accept either UTC-anchored format or any local-time equivalent; we just want
    // the date to have shifted away from "now" — but the simplest check is that
    // the year is 2024.
    expect(zips[0]).to.contain('2024')
  })
})
