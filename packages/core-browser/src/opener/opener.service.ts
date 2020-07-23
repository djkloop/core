import { Injectable, Autowired } from '@ali/common-di';
import { IOpenerService, IOpener } from '.';
import { URI, ILogger } from '@ali/ide-core-common';

@Injectable()
export class OpenerService implements IOpenerService {

  @Autowired(ILogger)
  private logger: ILogger;

  private openers: IOpener[] = [];

  private async getOpeners(uri: URI) {
    const filterResults = await Promise.all(this.openers.map(async (opener) => {
      try {
        if (opener.handleURI) {
          return await opener.handleURI(uri);
        }
        return await opener.handleScheme(uri.scheme);
      } catch (e) {
        this.logger.error(e);
        return false;
      }
    }));
    return this.openers.filter((_, index) => filterResults[index]);
  }

  public registerOpener(opener: IOpener) {
    this.openers.push(opener);
    return {
      dispose: () => {
        const index = this.openers.indexOf(opener);
        if (index !== -1) {
          this.openers.splice(index, 1);
        }
      },
    };
  }

  async open(uri: URI | string): Promise<boolean> {
    if (typeof uri === 'string') {
      uri = URI.parse(uri);
    }
    const openers = await this.getOpeners(uri);

    for (const opener of openers) {
      const handled = await opener.open(uri);
      if (handled) {
        return true;
      }
    }

    return false;
  }

  dispose() {
    this.openers = [];
  }

}