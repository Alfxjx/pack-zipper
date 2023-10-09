import { Args, Command, Flags, ux } from '@oclif/core'
import JSZip from 'jszip'
import moment from 'moment';
import * as fs from 'node:fs'
import path from 'node:path';

interface IManifest {
  name: string,
  version: string,
  branch: string,
  buildTime: string,
  commitID: string,
  comment: string
}

export default class Zip extends Command {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({ char: 'n', description: 'name to print', required: true }),
    // ftp / version default version
    type: Flags.string({ char: 't', description: '压缩文件名称类型', required: false }),
    // 配置文件的目录
    dist: Flags.string({ char: 'd', description: '文件目录', required: false }),
  }

  static args = {
    file: Args.string({ description: '配置文件地址' }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Zip)

    await ux.action.start(`压缩: ${flags.name}`)
    await this.doZip(flags.name, flags.type, flags.dist);
    await ux.action.stop()


  }

  async readJsonFile(filePath: string): Promise<any> {
    try {
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      return jsonData;
    } catch (error) {
      throw new Error(`Error reading JSON file: ${error}`);
    }
  }

  private async doZip(packName: string, type = 'version', dist = 'dist') {

    const zip = new JSZip();
    const cwd = process.cwd();

    const manifest: IManifest = await this.readJsonFile(`./${dist}/${packName}/manifest.json`);

    const buildZipFromDirectory = (dir: string, root: string) => {
      const list = fs.readdirSync(dir);

      for (let file of list) {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
          buildZipFromDirectory(file, root);
        } else {
          const filedata = fs.readFileSync(file);
          zip.file(path.relative(root, file), filedata);
        }
      }
    };




    zip.folder(manifest.name);

    buildZipFromDirectory(
      `${cwd}\\${dist}\\${manifest.name}`,
      `${cwd}\\${dist}\\${manifest.name}`,
    );

    zip.remove(manifest.name);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    let file = '';
    if (type === 'version') {
      const dateStr = moment(new Date(manifest.buildTime)).format('YYYY-MM-DD-HH-mm-ss');
      file = `${manifest.name}_${manifest.version}_${dateStr}.zip`;
    } else {
      const dateStr = moment(new Date()).format('YYYYMMDDHHmm');
      file = `${manifest.name}_Windows_${dateStr}.zip`;
    }

    fs.writeFileSync(`${cwd}\\${dist}\\${file}`, buffer);
    return `${cwd}\\${dist}\\${file}`;
  }

}
