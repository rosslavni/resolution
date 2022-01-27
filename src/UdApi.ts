import {toBech32Address} from './utils/znsUtils';
import {ResolutionError, ResolutionErrorCode} from './errors/resolutionError';
import {isValidTwitterSignature} from './utils/TwitterSignatureValidator';
import {
  CryptoRecords,
  ResolutionResponse,
  ResolutionMethod,
  NamingServiceName,
  Api,
  Locations,
} from './types/publicTypes';
import Networking from './utils/Networking';
import {constructRecords, findNamingServiceName, isNullAddress} from './utils';
import {znsNamehash, eip137Namehash} from './utils/namehash';
import {NamingService} from './NamingService';
import BN from 'bn.js';

/**
 * @internal
 */
export default class Udapi extends NamingService {
  private readonly network: number;
  private readonly name: ResolutionMethod;
  private readonly url: string;
  private readonly headers: {
    [key: string]: string;
  };

  constructor(api?: Api) {
    super();
    this.name = 'UDAPI';
    this.url = api?.url || 'https://unstoppabledomains.com/api/v1';
    const DefaultUserAgent =
      'cross-fetch/3.1.4 (+https://github.com/lquixada/cross-fetch)';
    const CustomUserAgent = `${DefaultUserAgent} Resolution`;
    this.headers = {'X-user-agent': CustomUserAgent};
    this.network = api?.network || 1;
  }

  async isSupportedDomain(domain: string): Promise<boolean> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      methodName: 'isSupportedDomain',
    });
  }

  namehash(domain: string): string {
    const serviceName = findNamingServiceName(domain);
    if (serviceName === NamingServiceName.ZNS) {
      return znsNamehash(domain);
    }

    return eip137Namehash(domain);
  }

  childhash(parentHash: string, label: string): string {
    throw new Error('Unsupported method whe using UD Resolution API');
  }

  async record(domain: string, key: string): Promise<string> {
    return (await this.records(domain, [key]))[key];
  }

  async records(domain: string, keys: string[]): Promise<CryptoRecords> {
    const records = await this.allRecords(domain);
    return constructRecords(keys, records);
  }

  async owner(domain: string): Promise<string> {
    const {owner} = (await this.resolve(domain)).meta;
    if (!owner) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain,
      });
    }

    if (domain.endsWith('.zil')) {
      return owner.startsWith('zil1') ? owner : toBech32Address(owner);
    }
    return owner;
  }

  async twitter(domain: string): Promise<string> {
    const serviceName = findNamingServiceName(domain);
    if (serviceName !== NamingServiceName.UNS) {
      throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
        domain,
        methodName: 'twitter',
      });
    }

    const domainMetaData = await this.resolve(domain);
    if (!domainMetaData.meta.owner) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain,
      });
    }
    const owner = domainMetaData.meta.owner;
    const records = domainMetaData.records || {};
    const validationSignature = records['validation.social.twitter.username'];
    const twitterHandle = records['social.twitter.username'];

    if (!validationSignature) {
      throw new ResolutionError(ResolutionErrorCode.RecordNotFound, {
        recordName: 'validation.social.twitter.username',
        domain: domain,
      });
    }
    if (!twitterHandle) {
      throw new ResolutionError(ResolutionErrorCode.RecordNotFound, {
        recordName: 'social.twitter.username',
        domain: domain,
      });
    }

    if (
      !isValidTwitterSignature({
        tokenId: domainMetaData.meta.namehash,
        owner,
        twitterHandle,
        validationSignature,
      })
    ) {
      throw new ResolutionError(
        ResolutionErrorCode.InvalidTwitterVerification,
        {
          domain,
        },
      );
    }

    return twitterHandle;
  }

  async allRecords(domain: string): Promise<CryptoRecords> {
    return (await this.resolve(domain)).records || {};
  }

  async getDomainFromTokenId(tokenId: string): Promise<string> {
    if (!tokenId.startsWith('0x')) {
      const tokenBN = new BN(tokenId, 10);
      tokenId = `0x${tokenBN.toString(16)}`;
    }
    const metadata = await this.getMetadata(tokenId);
    return metadata.meta.domain;
  }

  private async getMetadata(tokenId: string): Promise<ResolutionResponse> {
    const tokenUri = `${this.url}/${tokenId}`;
    const resp = await Networking.fetch(tokenUri, {}).catch((err) => {
      throw new ResolutionError(ResolutionErrorCode.MetadataEndpointError, {
        tokenUri: tokenUri || 'undefined',
        errorMessage: err.message,
      });
    });

    const metadata: ResolutionResponse = await resp.json();
    if (!metadata.meta || !metadata.meta.domain) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain: `with tokenId ${tokenId}`,
      });
    }
    if (this.namehash(metadata.meta.domain) !== tokenId) {
      throw new ResolutionError(ResolutionErrorCode.ServiceProviderError, {
        methodName: 'unhash',
        domain: metadata.meta.domain,
        providerMessage: 'Service provider returned an invalid domain name',
      });
    }
    return metadata;
  }

  async resolve(domain: string): Promise<ResolutionResponse> {
    const response = await Networking.fetch(`${this.url}/${domain}`, {
      method: 'GET',
      headers: this.headers,
    });
    return response.json();
  }

  serviceName(): ResolutionMethod {
    return this.name;
  }

  async resolver(domain: string): Promise<string> {
    const record = await this.resolve(domain);
    return record.meta.resolver;
  }

  async reverse(
    address: string,
    currencyTicker: string,
  ): Promise<string | null> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      methodName: 'reverse',
    });
  }
  async isRegistered(domain: string): Promise<boolean> {
    const record = await this.resolve(domain);

    return !isNullAddress(record.meta.owner);
  }

  async getTokenUri(tokenId: string): Promise<string> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      methodName: 'getTokenUri',
    });
  }

  async isAvailable(domain: string): Promise<boolean> {
    return !(await this.isRegistered(domain));
  }

  async registryAddress(domain: string): Promise<string> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      domain,
      methodName: 'registryAddress',
    });
  }

  async locations(domains: string[]): Promise<Locations> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      methodName: 'locations',
    });
  }
}
