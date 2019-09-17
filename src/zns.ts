import { Zilliqa } from '@zilliqa-js/zilliqa';
import { Contract } from '@zilliqa-js/contract';
import { toChecksumAddress } from '@zilliqa-js/crypto';
import namehash from './zns/namehash';
import _ from 'lodash';

const DefaultSource = 'https://api.zilliqa.com/';
const registryAddress = 'zil1jcgu2wlx6xejqk9jw3aaankw6lsjzeunx2j0jz';
const NullAddress = '0x0000000000000000000000000000000000000000';

type Resolution = {
  crypto?: { [key: string]: { address: string } };
  ttl?: string;
  [key: string]: any;
};

export default class {
  registry: Contract;
  zilliqa: Zilliqa;

  constructor(source: string | boolean = DefaultSource) {
    if (source == true) {
      source = DefaultSource;
    }
    source = source.toString();
    this.zilliqa = new Zilliqa(source);
    this.registry = this.zilliqa.contracts.at(registryAddress);
  }

  async getContractField(contract: Contract, field: string, keys: string[] = []): Promise<any> {
    let response = await this.zilliqa.provider.send(
      "GetSmartContractSubState",
      contract.address.replace("0x", "").toLowerCase(),
      field,
      keys.map(k => JSON.stringify(k))
    );
    return (response.result || {})[field];
  }

  async getContractMapValue(contract: Contract, field: string, key: string): Promise<any>  {
    return (await this.getContractField(contract, field, [key]))[key];
  }

  async getResolverRecordsStructure(
    resolverAddress: string,
  ): Promise<Resolution> {
    if (resolverAddress == NullAddress) {
      return {};
    }
    const resolver = this.zilliqa.contracts.at(
      toChecksumAddress(resolverAddress),
    );
    const resolverRecords = (await this.getContractField(
      resolver,
      'records',
    )) as { [key: string]: string };
    return _.transform(
      resolverRecords,
      (result, value, key) => _.set(result, key, value),
      {},
    );
  }

  async resolve(domain: string): Promise<Resolution | null> {
    const registryRecord = await this.getContractMapValue(
      this.registry,
      'records',
      namehash(domain),
    );

    if (!registryRecord) return null;
    const [ownerAddress, resolverAddress] = registryRecord.arguments as [
      string,
      string
    ];
    const resolution = await this.getResolverRecordsStructure(resolverAddress);
    const addresses = _.mapValues(resolution.crypto, 'address');
    return {
      addresses,
      meta: {
        owner: ownerAddress || null,
        type: 'zns',
        ttl: parseInt(resolution.ttl as string) || 0,
      },
    };
  }
}
