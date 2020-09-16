import sha256 from './utils/sha256';
import {
  fromBech32Address,
  toBech32Address,
  toChecksumAddress,
} from './zns/utils';
import { invert, set } from './utils';
import {
  Dictionary,
  ResolutionResponse,
  SourceDefinition,
  UnclaimedDomainResponse,
  ZnsResolution,
  NamingServiceName,
  isNullAddress,
  nodeHash,
} from './types';
import { ResolutionError, ResolutionErrorCode } from './index';
import NamingService from './NamingService';

const DefaultSource = 'https://api.zilliqa.com';

const NetworkIdMap = {
  mainnet: 1,
  testnet: 333,
  localnet: 111,
};

const RegistryMap = {
  1: 'zil1jcgu2wlx6xejqk9jw3aaankw6lsjzeunx2j0jz',
};

const UrlMap = {
  1: 'https://api.zilliqa.com',
  333: 'https://dev-api.zilliqa.com',
  111: 'http://localhost:4201',
};

const UrlNetworkMap = (url: string) => invert(UrlMap)[url];

/** @internal */
export default class Zns extends NamingService {
  constructor(source: SourceDefinition = {}) {
    super(source, NamingServiceName.ZNS);
  }

  async resolve(domain: string): Promise<ResolutionResponse | null> {
    const recordAddresses = await this.getRecordsAddresses(domain);
    if (!recordAddresses) return UnclaimedDomainResponse;
    const [ownerAddress, resolverAddress] = recordAddresses;
    const resolution = this.structureResolverRecords(
      await this.getResolverRecords(resolverAddress),
    );
    const addresses: Record<string, string> = {};
    if (resolution.crypto) {
      Object.entries(resolution.crypto).forEach(
        ([key, v]) => v.address && (addresses[key] = v.address),
      );
    }
    return {
      addresses,
      meta: {
        owner: ownerAddress || null,
        type: this.name,
        ttl: parseInt(resolution.ttl as string) || 0,
      },
      records: resolution.records,
    };
  }

  async address(domain: string, currencyTicker: string): Promise<string> {
    const data = await this.resolve(domain);
    if (isNullAddress(data?.meta?.owner)) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain,
      });
    }
    const address = data!.addresses[currencyTicker.toUpperCase()];
    if (!address) {
      throw new ResolutionError(ResolutionErrorCode.UnspecifiedCurrency, {
        domain,
        currencyTicker,
      });
    }
    return address;
  }

  async owner(domain: string): Promise<string | null> {
    const data = await this.resolve(domain);
    return data ? data.meta.owner : null;
  }

  async ipfsHash(domain: string): Promise<string> {
    return await this.getRecordOrThrow(domain, 'ipfs.html.value');
  }

  async httpUrl(domain: string): Promise<string> {
    return await this.getRecordOrThrow(domain, 'ipfs.redirect_domain.value');
  }

  async email(domain: string): Promise<string> {
    return await this.getRecordOrThrow(domain, 'whois.email.value');
  }

  async chatId(domain: string): Promise<string> {
    return await this.getRecordOrThrow(domain, 'gundb.username.value');
  }

  async chatpk(domain: string): Promise<string> {
    return await this.getRecordOrThrow(domain, 'gundb.public_key.value');
  }

  async record(domain: string, field: string) {
    return await this.getRecordOrThrow(domain, field);
  }

  async records(domain: string): Promise<Dictionary<string>> {
    return await this.getResolverRecords((await this.resolverAddress(domain))!);
  }

  async allRecords(domain: string): Promise<Record<string, string>> {
    const resolverAddress = await this.resolver(domain);
    return await this.getResolverRecords(resolverAddress);
  }

  isSupportedDomain(domain: string): boolean {
    const tokens = domain.split('.');
    return (
      !!tokens.length &&
      tokens[tokens.length - 1] === 'zil' &&
      tokens.every(v => !!v.length)
    );
  }

  isSupportedNetwork(): boolean {
    return this.registryAddress != null;
  }

  childhash(
    parent: nodeHash,
    label: string,
    options: { prefix: boolean } = { prefix: true },
  ): nodeHash {
    parent = parent.replace(/^0x/, '');
    return sha256(parent + sha256(label, { hexPrefix: false }), {
      hexPrefix: options.prefix,
      inputEnc: 'hex',
    });
  }

  async resolver(domain: string): Promise<string> {
    const recordsAddresses = await this.getRecordsAddresses(domain);
    if (!recordsAddresses || !recordsAddresses[0]) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain: domain,
      });
    }
    const [_, resolverAddress] = recordsAddresses;
    if (isNullAddress(resolverAddress)) {
      throw new ResolutionError(ResolutionErrorCode.UnspecifiedResolver, {
        domain: domain,
      });
    }
    return resolverAddress;
  }

  protected normalizeSource(
    source: SourceDefinition | undefined,
  ): SourceDefinition {
    source = { ...source };
    source.network =
      typeof source.network == 'string'
        ? NetworkIdMap[source.network]
        : source.network || (source.url && UrlNetworkMap[source.url]) || 1;

    if (!source.provider && !source.url) {
      source.url =
        typeof source.network === 'number' ? UrlMap[source.network] : undefined;
    }

    source.registry = source.registry || RegistryMap[source.network!];
    if (source.registry?.startsWith('0x')) {
      source.registry = toBech32Address(source.registry);
    }
    return source;
  }

  private async getRecordOrThrow(
    domain: string,
    field: string,
  ): Promise<string> {
    const records = await this.records(domain);
    return this.ensureRecordPresence(domain, field, records[field]);
  }

  private async getRecordsAddresses(
    domain: string,
  ): Promise<[string, string] | undefined> {
    if (!this.isSupportedDomain(domain) || !this.isSupportedNetwork()) {
      return undefined;
    }
    const registryRecord = await this.getContractMapValue(
      this.registryAddress!,
      'records',
      this.namehash(domain),
    );
    if (!registryRecord) return undefined;
    let [ownerAddress, resolverAddress] = registryRecord.arguments as [
      string,
      string,
    ];
    if (ownerAddress.startsWith('0x')) {
      ownerAddress = toBech32Address(ownerAddress);
    }
    return [ownerAddress, resolverAddress];
  }

  private async getResolverRecords(
    resolverAddress: string,
  ): Promise<ZnsResolution> {
    if (isNullAddress(resolverAddress)) {
      return {};
    }
    const resolver = toChecksumAddress(resolverAddress);
    return ((await this.getContractField(resolver, 'records')) ||
      {}) as Dictionary<string>;
  }

  private structureResolverRecords(records: Dictionary<string>): ZnsResolution {
    const result = {};
    for (const [key, value] of Object.entries(records)) {
      set(result, key, value);
    }
    return result;
  }

  private async resolverAddress(domain: string): Promise<string | undefined> {
    return ((await this.getRecordsAddresses(domain)) || [])[1];
  }

  private async fetchSubState(
    contractAddress: string,
    field: string,
    keys: string[] = [],
  ): Promise<any> {
    const params = [contractAddress.replace('0x', ''), field, keys];
    const method = 'GetSmartContractSubState';
    return await this.provider.request({ method, params });
  }

  private async getContractField(
    contractAddress: string,
    field: string,
    keys: string[] = [],
  ): Promise<any> {
    const contractAddr = contractAddress.startsWith('zil1')
      ? fromBech32Address(contractAddress)
      : contractAddress;
    const result = (await this.fetchSubState(contractAddr, field, keys)) || {};
    return result[field];
  }

  private async getContractMapValue(
    contractAddress: string,
    field: string,
    key: string,
  ): Promise<any> {
    const record = await this.getContractField(contractAddress, field, [key]);
    return (record && record[key]) || null;
  }
}
