import BN from 'bn.js';
import Zns from './Zns';
import Uns from './Uns';
import UdApi from './UdApi';
import {
  Api,
  AutoNetworkConfigs,
  CryptoRecords,
  DnsRecord,
  DnsRecordType,
  EthersProvider,
  Locations,
  NamehashOptions,
  NamehashOptionsDefault,
  NamingServiceName,
  Provider,
  ResolutionMethod,
  SourceConfig,
  TokenUriMetadata,
  Web3Version0Provider,
  Web3Version1Provider,
  ReverseResolutionOptions,
  UnsLocation,
} from './types/publicTypes';
import ResolutionError, {ResolutionErrorCode} from './errors/resolutionError';
import DnsUtils from './utils/DnsUtils';
import {findNamingServiceName, signedLink} from './utils';
import {Eip1993Factories as Eip1193Factories} from './utils/Eip1993Factories';
import {NamingService} from './NamingService';
import Networking from './utils/Networking';
import {prepareAndValidateDomain} from './utils/prepareAndValidate';
import {fromDecStringToHex} from './utils/namehash';

/**
 * Blockchain domain Resolution library - Resolution.
 * @example
 * ```
 * import Resolution from '@unstoppabledomains/resolution';
 *
 * let resolution = new Resolution({ blockchain: {
 *        uns: {
 *           url: "https://eth-mainnet.alchemyapi.io/v2/GmQ8X1FHf-WDEry0BBSn0RgjVhjHkRmS",
 *           network: "mainnet"
 *        }
 *      }
 *   });
 *
 * let domain = "brad.zil";
 * resolution.addr(domain, "eth").then(addr => console.log(addr));;
 * ```
 */
export default class Resolution {
  /**
   * @internal
   */
  readonly serviceMap: Record<NamingServiceName, ServicesEntry>;

  constructor({sourceConfig = undefined}: {sourceConfig?: SourceConfig} = {}) {
    const uns = isApi(sourceConfig?.uns)
      ? new UdApi(sourceConfig?.uns)
      : new Uns(sourceConfig?.uns);
    const zns = isApi(sourceConfig?.zns)
      ? new UdApi(sourceConfig?.zns)
      : new Zns(sourceConfig?.zns);

    // If both UNS and ZNS use the same UdApi providers, we don't want to call the API twice as it would return same
    // responses. It should be enough to compare just the URLs, as the network param isn't actually used in the calls.
    const equalUdApiProviders =
      uns instanceof UdApi && zns instanceof UdApi && uns.url === zns.url;

    // If a user configures the lib with an API source, we still want to initialise native blockchain services to access
    // some non-async methods such as namehash, as they are unavailable in the UdApi service.
    this.serviceMap = {
      [NamingServiceName.UNS]: {
        usedServices: [uns],
        native: isApi(sourceConfig?.uns) ? new Uns() : uns,
      },
      [NamingServiceName.ZNS]: {
        usedServices: equalUdApiProviders ? [uns] : [uns, zns],
        native: isApi(sourceConfig?.zns) ? new Zns() : zns,
      },
    };
  }

  /**
   * AutoConfigure the blockchain network for UNS
   * We make a "net_version" JSON RPC call to the blockchain either via url or with the help of given provider.
   * @param sourceConfig - configuration object for uns
   * @returns configured Resolution object
   */
  static async autoNetwork(
    sourceConfig: AutoNetworkConfigs,
  ): Promise<Resolution> {
    const resolution = new this();

    if (sourceConfig.uns) {
      const uns = await Uns.autoNetwork(sourceConfig.uns);
      resolution.serviceMap[NamingServiceName.UNS] = {
        usedServices: [uns],
        native: uns,
      };
    }

    return resolution;
  }

  /**
   * Creates a resolution with configured infura id for uns
   * @param infura - infura project id
   * @param networks - an optional object that describes what network to use when connecting UNS default is mainnet
   */
  static infura(
    infura: string,
    networks?: {
      uns?: {
        locations: {
          Layer1: {
            network: string;
          };
          Layer2: {
            network: string;
          };
        };
      };
    },
  ): Resolution {
    return new this({
      sourceConfig: {
        uns: {
          locations: {
            Layer1: {
              url: signedLink(infura, networks?.uns?.locations.Layer1.network),
              network: networks?.uns?.locations.Layer1.network || 'mainnet',
            },
            Layer2: {
              url: signedLink(infura, networks?.uns?.locations.Layer2.network),
              network:
                networks?.uns?.locations.Layer2.network || 'polygon-mainnet',
            },
          },
        },
      },
    });
  }

  /**
   * Creates a resolution instance with configured provider
   * @param networks - an object that describes what network to use when connecting UNS or ZNS default is mainnet
   * @see https://eips.ethereum.org/EIPS/eip-1193
   */
  static fromResolutionProvider(networks: {
    uns?: {
      locations: {
        Layer1: {provider: Provider; network: string};
        Layer2: {provider: Provider; network: string};
      };
    };
    zns?: {
      provider: Provider;
      network: string;
    };
  }): Resolution {
    if (networks.uns) {
      return this.fromEthereumEip1193Provider({
        uns: networks.uns,
      });
    }
    if (networks.zns) {
      return this.fromZilliqaProvider(networks.zns.provider, networks);
    }
    throw new ResolutionError(ResolutionErrorCode.ServiceProviderError, {
      providerMessage: 'Must specify network for uns or zns',
    });
  }

  /**
   * Creates a resolution instance with configured provider
   * @param networks - an object that describes what network to use when connecting UNS default is mainnet
   * @see https://eips.ethereum.org/EIPS/eip-1193
   */
  static fromEthereumEip1193Provider(networks: {
    uns?: {
      locations: {
        Layer1: {
          provider: Provider;
          network?: string;
        };
        Layer2: {
          provider: Provider;
          network?: string;
        };
      };
    };
  }): Resolution {
    const sourceConfig: SourceConfig = {};
    if (networks.uns) {
      sourceConfig.uns = {
        locations: {
          Layer1: {
            provider: networks.uns.locations.Layer1.provider,
            network: networks.uns.locations.Layer1.network || 'mainnet',
          },
          Layer2: {
            provider: networks.uns.locations.Layer2.provider,
            network: networks.uns.locations.Layer2.network || 'polygon-mainnet',
          },
        },
      };
    }
    return new this({
      sourceConfig,
    });
  }

  /**
   * Creates a resolution instance with configured provider
   * @param provider - any provider compatible with EIP-1193
   * @param networks - an optional object that describes what network to use when connecting ZNS default is mainnet
   * @see https://eips.ethereum.org/EIPS/eip-1193
   */
  static fromZilliqaProvider(
    provider: Provider,
    networks?: {
      zns?: {
        network: string;
      };
    },
  ): Resolution {
    return new this({
      sourceConfig: {
        zns: {provider, network: networks?.zns?.network || 'mainnet'},
      },
    });
  }

  /**
   * Create a resolution instance from web3 0.x version provider
   * @param networks - Ethereum network configuration with 0.x version provider from web3 ( must implement sendAsync(payload, callback) )
   * @see https://github.com/ethereum/web3.js/blob/0.20.7/lib/web3/httpprovider.js#L116
   */
  static fromWeb3Version0Provider(networks: {
    uns?: {
      locations: {
        Layer1: {
          provider: Web3Version0Provider;
          network: string;
        };
        Layer2: {
          provider: Web3Version0Provider;
          network: string;
        };
      };
    };
  }): Resolution {
    return this.fromEthereumEip1193Provider({
      uns: networks.uns
        ? {
          locations: {
            Layer1: {
              network: networks.uns.locations.Layer1.network,
              provider: Eip1193Factories.fromWeb3Version0Provider(
                networks.uns.locations.Layer1.provider,
              ),
            },
            Layer2: {
              network: networks.uns.locations.Layer2.network,
              provider: Eip1193Factories.fromWeb3Version0Provider(
                networks.uns.locations.Layer2.provider,
              ),
            },
          },
        }
        : undefined,
    });
  }

  /**
   * Create a resolution instance from web3 1.x version provider
   * @param networks - an optional object with 1.x version provider from web3 ( must implement send(payload, callback) ) that describes what network to use when connecting UNS default is mainnet
   * @see https://github.com/ethereum/web3.js/blob/1.x/packages/web3-core-helpers/types/index.d.ts#L165
   * @see https://github.com/ethereum/web3.js/blob/1.x/packages/web3-providers-http/src/index.js#L95
   */
  static fromWeb3Version1Provider(networks: {
    uns?: {
      locations: {
        Layer1: {
          provider: Web3Version1Provider;
          network: string;
        };
        Layer2: {
          provider: Web3Version1Provider;
          network: string;
        };
      };
    };
  }): Resolution {
    return this.fromEthereumEip1193Provider({
      uns: networks.uns
        ? {
          locations: {
            Layer1: {
              network: networks.uns.locations.Layer1.network,
              provider: Eip1193Factories.fromWeb3Version1Provider(
                networks.uns.locations.Layer1.provider,
              ),
            },
            Layer2: {
              network: networks.uns.locations.Layer2.network,
              provider: Eip1193Factories.fromWeb3Version1Provider(
                networks.uns.locations.Layer2.provider,
              ),
            },
          },
        }
        : undefined,
    });
  }

  /**
   * Creates instance of resolution from provider that implements Ethers Provider#call interface.
   * This wrapper support only `eth_call` method for now, which is enough for all the current Resolution functionality
   * @param networks - an object that describes what network to use when connecting UNS default is mainnet
   * @see https://github.com/ethers-io/ethers.js/blob/v4-legacy/providers/abstract-provider.d.ts#L91
   * @see https://github.com/ethers-io/ethers.js/blob/v5.0.4/packages/abstract-provider/src.ts/index.ts#L224
   * @see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#jsonrpcprovider-inherits-from-provider
   * @see https://github.com/ethers-io/ethers.js/blob/master/packages/providers/src.ts/json-rpc-provider.ts
   */
  static fromEthersProvider(networks: {
    uns?: {
      locations: {
        Layer1: {
          network: string;
          provider: EthersProvider;
        };
        Layer2: {
          network: string;
          provider: EthersProvider;
        };
      };
    };
  }): Resolution {
    return this.fromEthereumEip1193Provider({
      uns: networks.uns
        ? {
          locations: {
            Layer1: {
              network: networks.uns.locations.Layer1.network,
              provider: Eip1193Factories.fromEthersProvider(
                networks.uns.locations.Layer1.provider,
              ),
            },
            Layer2: {
              network: networks.uns.locations.Layer2.network,
              provider: Eip1193Factories.fromEthersProvider(
                networks.uns.locations.Layer2.provider,
              ),
            },
          },
        }
        : undefined,
    });
  }

  /**
   * Resolves given domain name to a specific currency address if exists
   * @async
   * @param domain - domain name to be resolved
   * @param ticker - currency ticker like BTC, ETH, ZIL
   * @throws [[ResolutionError]] if address is not found
   * @returns A promise that resolves in an address
   */
  async addr(domain: string, ticker: string): Promise<string> {
    return this.record(domain, `crypto.${ticker.toUpperCase()}.address`);
  }

  /**
   * Read multi-chain currency address if exists
   * @async
   * @param domain - domain name to be resolved
   * @param ticker - currency ticker (USDT, FTM, etc.)
   * @param chain - chain version, usually means blockchain ( ERC20, BEP2, OMNI, etc. )
   * @throws [[ResolutionError]] if address is not found
   * @returns A promise that resolves in an adress
   */
  async multiChainAddr(
    domain: string,
    ticker: string,
    chain: string,
  ): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    const recordKey = `crypto.${ticker.toUpperCase()}.version.${chain.toUpperCase()}.address`;
    return this.callForDomain(domain, 'record', [domain, recordKey]);
  }

  /**
   * Resolves given domain name to a verified twitter handle
   * @async
   * @param domain - domain name to be resolved
   * @throws [[ResolutionError]] if twitter is not found
   * @returns A promise that resolves in a verified twitter handle
   */
  async twitter(domain: string): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomain(domain, 'twitter', [domain]);
  }

  /**
   * Resolve a chat id from the domain record
   * @param domain - domain name to be resolved
   * @throws [[ResolutionError]]
   * @returns A promise that resolves in chatId
   */
  async chatId(domain: string): Promise<string> {
    return this.record(domain, 'gundb.username.value');
  }

  /**
   * Resolve a gundb public key from the domain record
   * @param domain - domain name to be resolved
   * @throws [[ResolutionError]]
   * @returns a promise that resolves in gundb public key
   */
  async chatPk(domain: string): Promise<string> {
    return this.record(domain, 'gundb.public_key.value');
  }

  /**
   * Resolves the IPFS hash configured for domain records on ZNS
   * @param domain - domain name
   * @throws [[ResolutionError]]
   */
  async ipfsHash(domain: string): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    return this.getPreferableNewRecord(
      domain,
      'dweb.ipfs.hash',
      'ipfs.html.value',
    );
  }

  /**
   * Resolves the httpUrl attached to domain
   * @param domain - domain name
   */
  async httpUrl(domain: string): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    return this.getPreferableNewRecord(
      domain,
      'browser.redirect_url',
      'ipfs.redirect_domain.value',
    );
  }

  /**
   * Resolves the ipfs email field from whois configurations
   * @param domain - domain name
   * @throws [[ResolutionError]]
   * @returns A Promise that resolves in an email address configured for this domain whois
   */
  async email(domain: string): Promise<string> {
    return this.record(domain, 'whois.email.value');
  }

  /**
   * @returns the resolver address for a specific domain
   * @param domain - domain to look for
   */
  async resolver(domain: string): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    const resolver = await this.callForDomain(domain, 'resolver', [domain]);
    if (!resolver) {
      throw new ResolutionError(ResolutionErrorCode.UnspecifiedResolver, {
        domain,
      });
    }
    return resolver;
  }

  /**
   * @param domain - domain name
   * @returns An owner address of the domain
   */
  async owner(domain: string): Promise<string | null> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomain(domain, 'owner', [domain]);
  }

  /**
   * @param domain - domain name
   * @param recordKey - a name of a record to be resolved
   * @returns A record value promise for a given record name
   */
  async record(domain: string, recordKey: string): Promise<string> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomain(domain, 'record', [domain, recordKey]);
  }

  /**
   * @param domain domain name
   * @param keys Array of record keys to be resolved
   * @returns A Promise with key-value mapping of domain records
   */
  async records(domain: string, keys: string[]): Promise<CryptoRecords> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomain(domain, 'records', [domain, keys]);
  }

  /**
   * @param domain domain name
   * @returns A Promise of whether or not the domain belongs to a wallet
   */
  async isRegistered(domain: string): Promise<boolean> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomainBoolean(domain, 'isRegistered', [domain], {
      throwIfUnsupportedDomain: true,
    });
  }

  /**
   * @param domain domain name
   * @returns A Promise of whether or not the domain is available
   */
  async isAvailable(domain: string): Promise<boolean> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomainBoolean(domain, 'isAvailable', [domain], {
      throwIfUnsupportedDomain: true,
    });
  }

  /**
   * @returns Produces a namehash from supported naming service in hex format with 0x prefix.
   * Corresponds to ERC721 token id in case of Ethereum based naming service like UNS.
   * @param domain domain name to be converted
   * @param namingService TODO!
   * @param options formatting options
   * @throws [[ResolutionError]] with UnsupportedDomain error code if domain extension is unknown
   */
  namehash(
    domain: string,
    namingService: NamingServiceName,
    options: NamehashOptions = NamehashOptionsDefault,
  ): string {
    const service = this.serviceMap[namingService];
    if (!service) {
      throw new ResolutionError(ResolutionErrorCode.UnsupportedService, {
        namingService,
      });
    }

    domain = prepareAndValidateDomain(domain);
    return this.formatNamehash(service.native.namehash(domain), options);
  }

  /**
   * @returns a namehash of a subdomain with name label
   * @param parent namehash of a parent domain
   * @param label subdomain name
   * @param namingService "UNS" or "ZNS"
   * @param options formatting options
   */
  childhash(
    parent: string,
    label: string,
    namingService: NamingServiceName,
    options: NamehashOptions = NamehashOptionsDefault,
  ): string {
    const service = this.serviceMap[namingService];
    if (!service) {
      throw new ResolutionError(ResolutionErrorCode.UnsupportedService, {
        namingService,
      });
    }
    return this.formatNamehash(
      service.native.childhash(parent, label),
      options,
    );
  }

  private formatNamehash(hash, options: NamehashOptions) {
    hash = hash.replace('0x', '');
    if (options.format === 'dec') {
      return new BN(hash, 'hex').toString(10);
    } else {
      return options.prefix ? '0x' + hash : hash;
    }
  }

  /**
   * Checks weather the domain name matches the hash
   * @param domain - domain name to check against
   * @param hash - hash obtained from the blockchain
   * @param namingService - TODO!
   */
  isValidHash(
    domain: string,
    hash: string,
    namingService: NamingServiceName,
  ): boolean {
    const service = this.serviceMap[namingService];
    if (!service) {
      throw new ResolutionError(ResolutionErrorCode.UnsupportedService, {
        namingService,
      });
    }

    domain = prepareAndValidateDomain(domain);
    return service.native.namehash(domain) === hash;
  }

  /**
   * Checks if the domain name is valid according to naming service rules
   * for valid domain names.
   * @param domain - domain name to be checked
   */
  async isSupportedDomain(domain: string): Promise<boolean> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomainBoolean(domain, 'isSupportedDomain', [domain], {
      throwIfUnsupportedDomain: false,
    });
  }

  /**
   * Returns the name of the service for a domain UNS | ZNS
   * @param domain - domain name to look for
   */
  async serviceName(domain: string): Promise<ResolutionMethod> {
    domain = prepareAndValidateDomain(domain);
    // TODO! rewrite this method as it behaves incorrectly atm (or remove, as we have `locations`).
    return this.callForDomain(domain, 'serviceName', []);
  }

  /**
   * Returns all record keys of the domain.
   * This method is strongly unrecommended for production use due to lack of support for many ethereum service providers and low performance
   * @param domain - domain name
   */
  async allRecords(domain: string): Promise<CryptoRecords> {
    domain = prepareAndValidateDomain(domain);
    return this.callForDomain(domain, 'allRecords', [domain]);
  }

  async allNonEmptyRecords(domain: string): Promise<CryptoRecords> {
    const records = await this.allRecords(domain);
    const nonEmptyRecords: CryptoRecords = {};
    for (const [key, value] of Object.entries(records)) {
      if (value) {
        nonEmptyRecords[key] = value;
      }
    }
    return nonEmptyRecords;
  }

  async dns(domain: string, types: DnsRecordType[]): Promise<DnsRecord[]> {
    const dnsUtils = new DnsUtils();
    domain = prepareAndValidateDomain(domain);
    const dnsRecordKeys = this.getDnsRecordKeys(types);
    const blockchainData = await this.callForDomain(domain, 'records', [
      domain,
      dnsRecordKeys,
    ]);
    return dnsUtils.toList(blockchainData);
  }

  /**
   * Retrieves the tokenURI from the registry smart contract.
   * @returns the ERC721Metadata#tokenURI contract method result
   * @param domain - domain name
   */
  async tokenURI(domain: string): Promise<string> {
    // TODO! even though only UNS is supported, we should rewrite this for extensibility.
    const namehash = this.namehash(domain, NamingServiceName.UNS);
    return this.callForDomain(domain, 'getTokenUri', [namehash]);
  }

  /**
   * Retrieves the data from the endpoint provided by tokenURI from the registry smart contract.
   * @returns the JSON response of the token URI endpoint
   * @param domain - domain name
   */
  async tokenURIMetadata(domain: string): Promise<TokenUriMetadata> {
    const tokenUri = await this.tokenURI(domain);
    return this.getMetadataFromTokenURI(tokenUri);
  }

  /**
   * Retrieves address of registry contract used for domain
   * @param domain - domain name
   * @returns Registry contract address
   */
  async registryAddress(domain: string): Promise<string> {
    return this.callForDomain(domain, 'registryAddress', [domain]);
  }

  /**
   * Retrieves the domain name from tokenId by parsing registry smart contract event logs.
   * @throws {ResolutionError} if returned domain name doesn't match the original namhash.
   * @returns the domain name retrieved from token metadata
   * @param hash - domain hash
   * @param service - nameservice which is used for lookup
   */
  async unhash(hash: string, service: NamingServiceName): Promise<string> {
    hash = fromDecStringToHex(hash);
    const services = this.serviceMap[service].usedServices;
    // UNS is the only service and ZNS is the one with the lowest priority.
    // We don't want to access the `native` service, as a user may want to call `UdApi`.
    const method = services[services.length - 1];
    return method.getDomainFromTokenId(hash);
  }

  /**
   * Retrieves address of registry contract used for domain
   * @param domains - domain name
   * @returns Promise<Locations> - A map of domain name and Location (a set of attributes like blockchain,
   */
  async locations(domains: string[]): Promise<Locations> {
    // TODO! it will still fail if the first domain is a UNS one and we also have ZNS ones in the array.
    return this.callForDomain(domains[0], 'locations', [domains]);
  }

  /**
   * Returns the token ID that is the primary resolution of the provided address
   * @param address - owner's address
   * @returns Promise<tokenId> - token ID that is the primary resolution of the provided address
   */
  async reverseTokenId(
    address: string,
    options?: ReverseResolutionOptions,
  ): Promise<string> {
    const tokenId = this.reverseGetTokenId(address, options?.location);
    return tokenId;
  }

  /**
   * Returns the domain that is the primary resolution of the provided address
   * @param address - owner's address
   * @returns Promise<URL> - domain URL that is the primary resolution of the provided addresss
   */
  async reverse(
    address: string,
    options?: ReverseResolutionOptions,
  ): Promise<string | null> {
    const tokenId = await this.reverseGetTokenId(address, options?.location);

    if (tokenId) {
      return this.unhash(tokenId as string, NamingServiceName.UNS);
    }

    return null;
  }

  private async getMetadataFromTokenURI(
    tokenUri: string,
  ): Promise<TokenUriMetadata> {
    const resp = await Networking.fetch(tokenUri, {});
    if (resp.ok) {
      return resp.json();
    }

    throw new ResolutionError(ResolutionErrorCode.ServiceProviderError, {
      providerMessage: await resp.text(),
      method: 'UDAPI',
      methodName: 'tokenURIMetadata',
    });
  }

  private getDnsRecordKeys(types: DnsRecordType[]): string[] {
    const records = ['dns.ttl'];
    types.forEach((type) => {
      records.push(`dns.${type}`);
      records.push(`dns.${type}.ttl`);
    });
    return records;
  }

  private async getPreferableNewRecord(
    domain: string,
    newRecord: string,
    oldRecord: string,
  ): Promise<string> {
    const records = await this.records(domain, [newRecord, oldRecord]);
    if (!records[newRecord] && !records[oldRecord]) {
      throw new ResolutionError(ResolutionErrorCode.RecordNotFound, {
        recordName: newRecord,
        domain: domain,
      });
    }
    return records[newRecord] || records[oldRecord];
  }

  private async callForDomain<F extends keyof NamingService>(
    domain: string,
    func: F,
    args: Parameters<NamingService[F]>,
  ): Promise<UnwrapPromise<ReturnType<NamingService[F]>>> {
    const serviceName = findNamingServiceName(domain);
    if (!serviceName) {
      throw new ResolutionError(ResolutionErrorCode.UnsupportedDomain, {
        domain,
      });
    }

    const servicePromises = this.prepareServiceCalls(
      this.serviceMap[serviceName].usedServices,
      func,
      args,
    );

    for (const servicePromise of servicePromises) {
      const serviceCallResult = await servicePromise;
      if (serviceCallResult.error !== null) {
        if (
          !(
            serviceCallResult.error instanceof ResolutionError &&
            serviceCallResult.error.code ===
              ResolutionErrorCode.UnregisteredDomain
          )
        ) {
          throw serviceCallResult.error;
        }
      } else {
        return serviceCallResult.result;
      }
    }

    throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
      domain,
    });
  }

  // Expects that a called method never throws the `ResolutionErrorCode.UnregisteredDomain` (it doesn't handle it).
  private async callForDomainBoolean<F extends NamingServiceBooleanMethods>(
    domain: string,
    func: F,
    args: Parameters<NamingService[F]>,
    options: {throwIfUnsupportedDomain: boolean},
  ): Promise<boolean> {
    const serviceName = findNamingServiceName(domain);
    if (!serviceName) {
      if (!options.throwIfUnsupportedDomain) {
        return false;
      }
      throw new ResolutionError(ResolutionErrorCode.UnsupportedDomain, {
        domain,
      });
    }

    const servicePromises = this.prepareServiceCalls(
      this.serviceMap[serviceName].usedServices,
      func,
      args,
    );

    for (const servicePromise of servicePromises) {
      const {result, error} = await servicePromise;
      if (error) {
        if (
          !(
            error instanceof ResolutionError &&
            error.code === ResolutionErrorCode.UnregisteredDomain
          )
        ) {
          throw error;
        }
      } else if (result) {
        // If the result is `false`, we don't want to return it immediately.
        return result;
      }
    }

    return false;
  }

  private prepareServiceCalls<F extends keyof NamingService>(
    services: NamingService[],
    func: F,
    args: Parameters<NamingService[F]>,
  ): Promise<NamingServiceResult<F>>[] {
    return services.map((method) => {
      let callResult;
      // Catch immediately in case it's not an async call.
      try {
        callResult = method[func].call(method, ...args);
      } catch (error) {
        return Promise.resolve({result: null, error});
      }

      // `Promise.resolve` will convert both promise-like objects and plain values to promises.
      const promise =
        callResult instanceof Promise
          ? callResult
          : Promise.resolve(callResult);
      // We wrap results and errors to avoid unhandled promise rejections in case we won't `await` every promise
      // and return earlier.
      return promise.then(
        (result) => ({result, error: null}),
        (error) => ({result: null, error}),
      );
    });
  }

  private async reverseGetTokenId(
    address: string,
    location?: UnsLocation,
  ): Promise<string> {
    const service = this.serviceMap['UNS'];
    const tokenId = await service.reverseOf(address, location);
    return tokenId as string;
  }
}

type NamingServiceResult<F extends keyof NamingService> =
  | {
      result: UnwrapPromise<ReturnType<NamingService[F]>>;
      error: null;
    }
  | {
      result: null;
      // The correct type would be `any` or `unknown`, but we don't care about it in this particular context.
      // We need a more narrow type to let TypeScript infer that `result` is not `null` if `error` is.
      error: Error;
    };

// If we create a type where we substitute every non-boolean method with `never`, it won't quite work for
// `callForDomainBoolean` (as `keyof NamingServiceWithOnlyBooleanMethods[F]` will still return every method name), hence
// this cursed type.
type NamingServiceBooleanMethods = {
  [K in keyof NamingService]: NamingService[K] extends (
    ...args: any
  ) => boolean | Promise<boolean>
    ? K
    : never;
} extends {
  [_ in keyof NamingService]: infer U;
}
  ? U
  : never;

export {Resolution};

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type ServicesEntry = {
  usedServices: NamingService[];
  // Note: even if a user configures the lib in the API mode, this will contain a blockchain naming service.
  native: NamingService;
};

function isApi(obj: any): obj is Api {
  return obj && obj.api;
}
