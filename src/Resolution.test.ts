import nock from 'nock';
import Resolution, {
  ResolutionErrorCode,
  UnclaimedDomainResponse,
} from './index';
import { TickerVersion, DnsRecordType, JsonRpcPayload } from './publicTypes';
import { JsonRpcProvider, InfuraProvider } from '@ethersproject/providers';
import Web3HttpProvider from 'web3-providers-http';
import Web3WsProvider from 'web3-providers-ws';
import Web3V027Provider from 'web3-0.20.7/lib/web3/httpprovider';
import {
  CryptoDomainWithAdaBchAddresses, CryptoDomainWithUsdtMultiChainRecords,
} from './tests/helpers';

import {
  expectResolutionErrorCode,
  expectSpyToBeCalled,
  mockAsyncMethods,
  protocolLink,
  ProviderProtocol,
  caseMock,
  mockAsyncMethod,
  CryptoDomainWithTwitterVerification,
  pendingInLive,
  CryptoDomainWithIpfsRecords,
} from './tests/helpers';
import { RpcProviderTestCases } from './tests/providerMockData';
import fetch, { FetchError } from 'node-fetch';
import standardKeys from './utils/standardKeys';

let resolution: Resolution;

beforeAll(async () => {
  resolution = new Resolution({
    blockchain: {
      cns: { url: protocolLink() },
      ens: { url: protocolLink() }
    }
  });
});

beforeEach(() => {
  nock.cleanAll();
  jest.restoreAllMocks();
});

describe('Resolution', () => {
  describe('.Basic setup', () => {
    it('should fail in test development',async () => {
      pendingInLive()
      try {
        await fetch("https://pokeres.bastionbot.org/images/pokemon/10.png");
      } catch(err) {
        // nock should prevent all outgoing traffic
        expect(err).toBeInstanceOf(FetchError);
        return
      }
      fail("nock is not configured correctly!");
    });

    it('should get a valid resolution instance', async () => {
      const resolution = Resolution.infura('api-key');
      expect(resolution.ens?.url).toBe(`https://mainnet.infura.io/v3/api-key`);
      expect(resolution.cns?.url).toBe(`https://mainnet.infura.io/v3/api-key`);
    });

    it('provides empty response constant', async () => {
      const response = UnclaimedDomainResponse;
      expect(response.addresses).toEqual({});
      expect(response.meta.owner).toEqual(null);
    });

    it('checks the isSupportedDomainInNetwork', async () => {
      const resolution = new Resolution();
      const result = resolution.isSupportedDomainInNetwork('brad.zil');
      expect(result).toBe(true);
    });

    describe('.ServiceName', () => {
      it('checks ens service name', () => {
        const resolution = new Resolution();
        const serviceName = resolution.serviceName('domain.eth');
        expect(serviceName).toBe('ENS');
      });

      it('should resolve gundb chat id', async () => {
        const eyes = mockAsyncMethods(resolution.cns, {
          get: {
            resolver: '0x878bC2f3f717766ab69C0A5f9A6144931E61AEd3',
            records: {
              [standardKeys.gundb_username]:
              '0x47992daf742acc24082842752fdc9c875c87c56864fee59d8b779a91933b159e48961566eec6bd6ce3ea2441c6cb4f112d0eb8e8855cc9cf7647f0d9c82f00831c',
            }
          },
        });
        const gundb = await resolution.chatId('homecakes.crypto');
        expectSpyToBeCalled(eyes);
        expect(gundb).toBe(
          '0x47992daf742acc24082842752fdc9c875c87c56864fee59d8b779a91933b159e48961566eec6bd6ce3ea2441c6cb4f112d0eb8e8855cc9cf7647f0d9c82f00831c',
        );
      });

      describe('.ipfsHash', () => {
        it('should prioritize new keys over depricated ones', async() => {
          pendingInLive();
          const spies = mockAsyncMethods(resolution.cns, {
            get: {
              resolver: '0xA1cAc442Be6673C49f8E74FFC7c4fD746f3cBD0D',
              records: {
                [standardKeys.dweb_hash]: 'new record Ipfs hash',
                [standardKeys.html]: 'old record Ipfs hash'
              }
            }
          });
          const hash = await resolution.ipfsHash(CryptoDomainWithIpfsRecords);
          expectSpyToBeCalled(spies);
          expect(hash).toBe('new record Ipfs hash');
        });

        it('should prioritize browser record key over ipfs.redirect_url one', async () => {
          pendingInLive();
          const spies = mockAsyncMethods(resolution.cns, {
            get: {
              resolver: '0xA1cAc442Be6673C49f8E74FFC7c4fD746f3cBD0D',
              records: {
                [standardKeys.browser_redirect]: 'new record redirect url',
                [standardKeys.redirect_domain]: 'old record redirect url'
              }
            }
          });
          const redirectUrl = await resolution.httpUrl(CryptoDomainWithIpfsRecords);
          expectSpyToBeCalled(spies);
          expect(redirectUrl).toBe('new record redirect url');
        });
      });

      describe('serviceName', () => {
        it('checks ens service name', () => {
          const resolution = new Resolution();
          const serviceName = resolution.serviceName('domain.eth');
          expect(serviceName).toBe('ENS');
        });

        it('checks zns service name', () => {
          const resolution = new Resolution();
          const serviceName = resolution.serviceName('domain.zil');
          expect(serviceName).toBe('ZNS');
        });

        it('checks cns service name', () => {
          const resolution = new Resolution();
          const serviceName = resolution.serviceName('domain.crypto');
          expect(serviceName).toBe('CNS');
        });

        it('checks naming service via api', () => {
          const resolution = new Resolution({ blockchain: false });
          const serviceName = resolution.serviceName('domain.zil');
          expect(serviceName).toBe('ZNS');
        });

        it('checks naming service via api 2', () => {
          const resolution = new Resolution({ blockchain: false });
          const serviceName = resolution.serviceName('domain.luxe');
          expect(serviceName).toBe('ENS');
        });

        it('checks naming service via api 3', () => {
          const resolution = new Resolution({ blockchain: false });
          const serviceName = resolution.serviceName('domain.xyz');
          expect(serviceName).toBe('ENS');
        });

        it('checks naming service via api 4', () => {
          const resolution = new Resolution({ blockchain: false });
          const serviceName = resolution.serviceName('domain.eth');
          expect(serviceName).toBe('ENS');
        });

        it('checks naming service via api 5', () => {
          const resolution = new Resolution({ blockchain: false });
          const serviceName = resolution.serviceName('domain.crypto');
          expect(serviceName).toBe('CNS');
        });

      });

    });

    describe('.Errors', () => {
      it('checks Resolution#addr error #1', async () => {
        const resolution = new Resolution();
        const spy = mockAsyncMethods(resolution.zns!, {
          getRecordsAddresses: undefined
        });
        await expectResolutionErrorCode(
          resolution.addr('sdncdoncvdinvcsdncs.zil', 'ZIL'),
          ResolutionErrorCode.UnregisteredDomain,
        );
        expectSpyToBeCalled(spy);
      });

      it('resolves non-existing domain zone with throw', async () => {
        const resolution = new Resolution({ blockchain: true });
        await expectResolutionErrorCode(
          resolution.addr('bogdangusiev.qq', 'ZIL'),
          ResolutionErrorCode.UnsupportedDomain,
        );
      });

      it('checks error for email on brad.zil', async () => {
        const resolution = new Resolution();
        const spies = mockAsyncMethods(resolution.zns, {
          allRecords: {
            'crypto.BCH.address': 'qrq4sk49ayvepqz7j7ep8x4km2qp8lauvcnzhveyu6',
            'crypto.BTC.address': '1EVt92qQnaLDcmVFtHivRJaunG2mf2C3mB',
            'crypto.DASH.address': 'XnixreEBqFuSLnDSLNbfqMH1GsZk7cgW4j',
            'crypto.ETH.address': '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
            'crypto.LTC.address': 'LetmswTW3b7dgJ46mXuiXMUY17XbK29UmL',
            'crypto.XMR.address': '447d7TVFkoQ57k3jm3wGKoEAkfEym59mK96Xw5yWamDNFGaLKW5wL2qK5RMTDKGSvYfQYVN7dLSrLdkwtKH3hwbSCQCu26d',
            'crypto.ZEC.address': 't1h7ttmQvWCSH1wfrcmvT4mZJfGw2DgCSqV',
            'crypto.ZIL.address': 'zil1yu5u4hegy9v3xgluweg4en54zm8f8auwxu0xxj',
            'ipfs.html.value': 'QmVaAtQbi3EtsfpKoLzALm6vXphdi2KjMgxEDKeGg6wHuK',
            'ipfs.redirect_domain.value': 'www.unstoppabledomains.com'
          }
        });
        await expectResolutionErrorCode(
          resolution.email('brad.zil'),
          ResolutionErrorCode.RecordNotFound,
        );
        expectSpyToBeCalled(spies);
      });

      describe('.Namehash errors', () => {
        it('checks namehash for unsupported domain', async () => {
          const resolution = new Resolution();
          await expectResolutionErrorCode(
            () => resolution.namehash('something.hello.com'),
            ResolutionErrorCode.UnsupportedDomain,
          );
        });

        it('should be invalid domain', async () => {
          const resolution = new Resolution();
          await expectResolutionErrorCode(
            () => resolution.namehash('-hello.eth'),
            ResolutionErrorCode.UnsupportedDomain,
          );
        });

        it('should be invalid domain 2', async () => {
          const resolution = new Resolution();
          await expectResolutionErrorCode(
            () => resolution.namehash('whatever-.eth'),
            ResolutionErrorCode.UnsupportedDomain,
          );
        });

        it('should be invalid domain 3', async () => {
          const cnsInvalidDomain = 'hello..crypto';
          const ensInvalidDomain = 'hello..eth';
          const znsInvalidDomain = 'hello..zil';
          const resolution = new Resolution();
          await expectResolutionErrorCode(
            () => resolution.namehash(cnsInvalidDomain),
            ResolutionErrorCode.UnsupportedDomain,
          );
          await expectResolutionErrorCode(
            () => resolution.namehash(ensInvalidDomain),
            ResolutionErrorCode.UnsupportedDomain,
          );
          await expectResolutionErrorCode(
            () => resolution.namehash(znsInvalidDomain),
            ResolutionErrorCode.UnsupportedDomain,
          );
        });
      });

    });

    describe('.Records', () => {
      describe('.DNS', () => {
        it('getting dns get', async () => {
          pendingInLive();
          const spies = mockAsyncMethods(resolution.cns, {
            get: {
              resolver: '0xBD5F5ec7ed5f19b53726344540296C02584A5237',
              records: {
                'dns.ttl': '128',
                'dns.A': '["10.0.0.1","10.0.0.2"]',
                'dns.A.ttl': '90',
                'dns.AAAA': '["10.0.0.120"]',
              }
            },
          });
          const dnsRecords = await resolution.dns("someTestDomain.crypto", [DnsRecordType.A, DnsRecordType.AAAA]);
          expectSpyToBeCalled(spies);
          expect(dnsRecords).toStrictEqual([
            { TTL: 90, data: '10.0.0.1', type: 'A' },
            { TTL: 90, data: '10.0.0.2', type: 'A' },
            { TTL: 128, data: '10.0.0.120', type: 'AAAA' }
          ]);
        });

        it('should work with others records', async () => {
          pendingInLive();
          const spies = mockAsyncMethods(resolution.cns, {
            get: {
              resolver: '0xBD5F5ec7ed5f19b53726344540296C02584A5237',
              records: {
                'dns.ttl': '128',
                'dns.A': '["10.0.0.1","10.0.0.2"]',
                'dns.A.ttl': '90',
                'dns.AAAA': '["10.0.0.120"]',
                [standardKeys.ETH]: '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
                [standardKeys.ADA]: '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
                [standardKeys.ARK]: '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
              }
            }
          });
          const dnsRecords = await resolution.dns("someTestDomain.crypto", [DnsRecordType.A, DnsRecordType.AAAA]);
          expectSpyToBeCalled(spies);
          expect(dnsRecords).toStrictEqual(
            [
              { TTL: 90, data: '10.0.0.1', type: 'A' },
              { TTL: 90, data: '10.0.0.2', type: 'A' },
              { TTL: 128, data: '10.0.0.120', type: 'AAAA' }
            ]
          );
        })
      });

      describe('.Metadata', () => {
        it('checks return of email for ergergergerg.zil', async () => {
          const spies = mockAsyncMethods(resolution.zns, {
            allRecords: {
              'ipfs.html.hash': 'QmefehFs5n8yQcGCVJnBMY3Hr6aMRHtsoniAhsM1KsHMSe',
              'ipfs.html.value': 'QmVaAtQbi3EtsfpKoLzALm6vXphdi2KjMgxEDKeGg6wHu',
              'ipfs.redirect_domain.value': 'www.unstoppabledomains.com',
              'whois.email.value': 'matt+test@unstoppabledomains.com',
              'whois.for_sale.value': 'true'
            }
          });
          const email = await resolution.email('ergergergerg.zil');
          expectSpyToBeCalled(spies);
          expect(email).toBe('matt+test@unstoppabledomains.com');
        });
      });

      describe('.Crypto', () => {
        it(`domains "brad.crypto" and "Brad.crypto" should return the same results`, async () => {
          const eyes = mockAsyncMethods(resolution.cns, {
            get: {
              resolver: '0xBD5F5ec7ed5f19b53726344540296C02584A5237',
              records: {
                [standardKeys.ETH]: '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
              }
            },
          });
          const capital = await resolution.addr('Brad.crypto', 'eth');
          const lower = await resolution.addr('brad.crypto', 'eth');
          expectSpyToBeCalled(eyes, 2);
          expect(capital).toStrictEqual(lower);
        });

        describe('.multichain Usdt', () => {
          it('should work with usdt erc20 multichain', async () => {
            const erc20Spy = mockAsyncMethod(resolution.cns, "get", {
              resolver: '0xb66DcE2DA6afAAa98F2013446dBCB0f4B0ab2842',
              owner: '0xe7474D07fD2FA286e7e0aa23cd107F8379085037',
              records: {
                [standardKeys.USDT_ERC20]: '0xe7474D07fD2FA286e7e0aa23cd107F8379085037'
              }
            });
            const erc20 = await resolution.usdt(CryptoDomainWithUsdtMultiChainRecords, TickerVersion.ERC20);
            expect(erc20).toBe('0xe7474D07fD2FA286e7e0aa23cd107F8379085037');
            expect(erc20Spy).toBeCalled();
          });

          it('should work with usdt tron chain', async () => {
            const tronSpy = mockAsyncMethod(resolution.cns, "get", {
              resolver: '0xb66DcE2DA6afAAa98F2013446dBCB0f4B0ab2842',
              owner: '0xe7474D07fD2FA286e7e0aa23cd107F8379085037',
              records: {
                [standardKeys.USDT_TRON]: 'TNemhXhpX7MwzZJa3oXvfCjo5pEeXrfN2h'
              }
            });
            const tron = await resolution.usdt(CryptoDomainWithUsdtMultiChainRecords, TickerVersion.TRON);
            expect(tron).toBe('TNemhXhpX7MwzZJa3oXvfCjo5pEeXrfN2h');
            expect(tronSpy).toBeCalled();
          });

          it('should work with usdt omni chain', async () => {
            const omniSpy = mockAsyncMethod(resolution.cns, "get", {
              resolver: '0xb66DcE2DA6afAAa98F2013446dBCB0f4B0ab2842',
              owner: '0xe7474D07fD2FA286e7e0aa23cd107F8379085037',
              records: {
                [standardKeys.USDT_OMNI]: '19o6LvAdCPkjLi83VsjrCsmvQZUirT4KXJ'
              }
            });
            const omni = await resolution.usdt(CryptoDomainWithUsdtMultiChainRecords, TickerVersion.OMNI);
            expect(omni).toBe('19o6LvAdCPkjLi83VsjrCsmvQZUirT4KXJ');
            expect(omniSpy).toBeCalled();
          });

          it('should work with usdt eos chain', async () => {
            const eosSpy = mockAsyncMethod(resolution.cns, "get", {
              resolver: '0xb66DcE2DA6afAAa98F2013446dBCB0f4B0ab2842',
              owner: '0xe7474D07fD2FA286e7e0aa23cd107F8379085037',
              records: {
                [standardKeys.USDT_EOS]: 'letsminesome'
              }
            });
            const eos = await resolution.usdt(CryptoDomainWithUsdtMultiChainRecords, TickerVersion.EOS);
            expect(eosSpy).toBeCalled();
            expect(eos).toBe('letsminesome');
          });
        });
      });
        

      describe('.Providers', () => {
        it('should work with web3HttpProvider', async () => {
        // web3-providers-http has problems with type definitions
        // We still prefer everything to be statically typed on our end for better mocking
          const provider = new (Web3HttpProvider as any)(
            protocolLink(),
          ) as Web3HttpProvider.HttpProvider;
          // mock the send function with different implementations (each should call callback right away with different answers)
          const eye = mockAsyncMethod(
            provider,
            'send',
            (payload: JsonRpcPayload, callback) => {
              const result = caseMock(payload.params?.[0], RpcProviderTestCases);
              callback &&
              callback(null, {
                jsonrpc: '2.0',
                id: 1,
                result,
              });
            },
          );
          const resolution = Resolution.fromWeb3Version1Provider(provider);
          const ethAddress = await resolution.addr('brad.crypto', 'ETH');

          // expect each mock to be called at least once.
          expectSpyToBeCalled([eye]);
          expect(ethAddress).toBe('0x8aaD44321A86b170879d7A244c1e8d360c99DdA8');
        });

        it('should work with webSocketProvider', async () => {
        // web3-providers-ws has problems with type definitions
        // We still prefer everything to be statically typed on our end for better mocking
          const provider = new (Web3WsProvider as any)(
            protocolLink(ProviderProtocol.wss),
          ) as Web3WsProvider.WebsocketProvider;
          const eye = mockAsyncMethod(provider, 'send', (payload, callback) => {
            const result = caseMock(payload.params?.[0], RpcProviderTestCases);
            callback(null, {
              jsonrpc: '2.0',
              id: 1,
              result,
            });
          });

          const resolution = Resolution.fromWeb3Version1Provider(provider);
          const ethAddress = await resolution.addr('brad.crypto', 'ETH');
          provider.disconnect(1000, 'end of test');
          expectSpyToBeCalled([eye]);
          expect(ethAddress).toBe('0x8aaD44321A86b170879d7A244c1e8d360c99DdA8');
        });

        it('should work for ethers jsonrpc provider', async () => {
          const provider = new JsonRpcProvider(
            protocolLink(ProviderProtocol.http),
            'mainnet',
          );
          const resolution = Resolution.fromEthersProvider(provider);
          const eye = mockAsyncMethod(provider, 'call', params =>
            Promise.resolve(caseMock(params, RpcProviderTestCases)),
          );
          const ethAddress = await resolution.addr('brad.crypto', 'ETH');
          expectSpyToBeCalled([eye]);
          expect(ethAddress).toBe('0x8aaD44321A86b170879d7A244c1e8d360c99DdA8');
        });

        it('should work with ethers default provider', async () => {
          // const provider = getDefaultProvider('mainnet');
          const provider = new InfuraProvider('mainnet', '213fff28936343858ca9c5115eff1419');

          const eye = mockAsyncMethod(provider, 'call', params =>
            Promise.resolve(caseMock(params, RpcProviderTestCases)),
          );
          const resolution = Resolution.fromEthersProvider(provider);
          const ethAddress = await resolution.addr('brad.crypto', 'eth');
          expectSpyToBeCalled([eye]);
          expect(ethAddress).toBe('0x8aaD44321A86b170879d7A244c1e8d360c99DdA8');
        });

        it('should work with web3@0.20.7 provider', async () => {
          const provider = new Web3V027Provider(
            protocolLink(ProviderProtocol.http),
            5000,
            null,
            null,
            null,
          );
          const eye = mockAsyncMethod(
            provider,
            'sendAsync',
            (payload: JsonRpcPayload, callback: any) => {
              const result = caseMock(payload.params?.[0], RpcProviderTestCases);
              callback(undefined, {
                jsonrpc: '2.0',
                id: 1,
                result,
              });
            },
          );
          const resolution = Resolution.fromWeb3Version0Provider(provider);
          const ethAddress = await resolution.addr('brad.crypto', 'eth');
          expectSpyToBeCalled([eye]);
          expect(ethAddress).toBe('0x8aaD44321A86b170879d7A244c1e8d360c99DdA8');
        });

        describe('.All-get', () => {
          it('should be able to get logs with ethers default provider', async () => {
            // const provider = getDefaultProvider('mainnet', { quorum: 1 });
            const provider = new InfuraProvider('mainnet', '213fff28936343858ca9c5115eff1419');

            const eye = mockAsyncMethod(provider, 'call', params =>
              Promise.resolve(caseMock(params, RpcProviderTestCases)),
            );
            const eye2 = mockAsyncMethod(provider, 'getLogs', params =>
              Promise.resolve(caseMock(params, RpcProviderTestCases)),
            );

            const resolution = Resolution.fromEthersProvider(provider);
            const resp = await resolution.allRecords('brad.crypto');
            expectSpyToBeCalled([eye], 2);
            expectSpyToBeCalled([eye2], 2);
            expect(resp).toMatchObject({
              'gundb.username.value':
              '0x8912623832e174f2eb1f59cc3b587444d619376ad5bf10070e937e0dc22b9ffb2e3ae059e6ebf729f87746b2f71e5d88ec99c1fb3c7c49b8617e2520d474c48e1c',
              'ipfs.html.value': 'Qme54oEzRkgooJbCDr78vzKAWcv6DDEZqRhhDyDtzgrZP6',
              'ipfs.redirect_domain.value':
              'https://abbfe6z95qov3d40hf6j30g7auo7afhp.mypinata.cloud/ipfs/Qme54oEzRkgooJbCDr78vzKAWcv6DDEZqRhhDyDtzgrZP6',
              'crypto.ETH.address': '0x8aaD44321A86b170879d7A244c1e8d360c99DdA8',
              'gundb.public_key.value':
              'pqeBHabDQdCHhbdivgNEc74QO-x8CPGXq4PKWgfIzhY.7WJR5cZFuSyh1bFwx0GWzjmrim0T5Y6Bp0SSK0im3nI',
              'crypto.BTC.address': 'bc1q359khn0phg58xgezyqsuuaha28zkwx047c0c3y',
            });
          });

          it('should be able to get logs with jsonProvider', async () => {
            const provider = new JsonRpcProvider(
              protocolLink(ProviderProtocol.http),
              'mainnet',
            );
            const resolution = Resolution.fromEthersProvider(provider);
            const eye = mockAsyncMethod(provider, 'call', params =>
              Promise.resolve(caseMock(params, RpcProviderTestCases)),
            );
            const eye2 = mockAsyncMethod(provider, 'getLogs', params =>
              Promise.resolve(caseMock(params, RpcProviderTestCases)),
            );

            const resp = await resolution.allRecords('brad.crypto');
            expectSpyToBeCalled([eye], 2);
            expectSpyToBeCalled([eye2], 2);
            expect(resp).toMatchObject({
              'gundb.username.value':
              '0x8912623832e174f2eb1f59cc3b587444d619376ad5bf10070e937e0dc22b9ffb2e3ae059e6ebf729f87746b2f71e5d88ec99c1fb3c7c49b8617e2520d474c48e1c',
              'ipfs.html.value': 'Qme54oEzRkgooJbCDr78vzKAWcv6DDEZqRhhDyDtzgrZP6',
              'ipfs.redirect_domain.value':
              'https://abbfe6z95qov3d40hf6j30g7auo7afhp.mypinata.cloud/ipfs/Qme54oEzRkgooJbCDr78vzKAWcv6DDEZqRhhDyDtzgrZP6',
              'crypto.ETH.address': '0x8aaD44321A86b170879d7A244c1e8d360c99DdA8',
              'gundb.public_key.value':
              'pqeBHabDQdCHhbdivgNEc74QO-x8CPGXq4PKWgfIzhY.7WJR5cZFuSyh1bFwx0GWzjmrim0T5Y6Bp0SSK0im3nI',
              'crypto.BTC.address': 'bc1q359khn0phg58xgezyqsuuaha28zkwx047c0c3y',
            });
          });

          it('should get standard keys from legacy resolver', async () => {
            const provider = new InfuraProvider('mainnet', '213fff28936343858ca9c5115eff1419');
            const eye = mockAsyncMethod(provider, 'call', params =>
              Promise.resolve(caseMock(params, RpcProviderTestCases)),
            );

            const resolution = Resolution.fromEthersProvider(provider);
            const resp = await resolution.allRecords('monmouthcounty.crypto');

            expectSpyToBeCalled([eye], 2);
            expect(resp).toMatchObject({
              'crypto.BTC.address': '3NwuV8nVT2VKbtCs8evChdiW6kHTHcVpdn',
              'crypto.ETH.address': '0x1C42088b82f6Fa5fB883A14240C4E066dDFf1517',
              'crypto.LTC.address': 'MTnTNwKikiMi97Teq8XQRabL9SZ4HjnKNB',
              'crypto.ADA.address':
              'DdzFFzCqrhsfc3MQvjsLr9BHkaFYeE7BotyTATdETRoSPj6QPiotK4xpcFZk66KVmtr87tvUFTcbTHZRkcdbMR5Ss6jCfzCVtFRMB7WE',
              'ipfs.html.value': 'QmYqX8D8SkaF5YcpaWMyi5xM43UEteFiSNKYsjLcdvCWud',
              'ipfs.redirect_domain.value':
              'https://abbfe6z95qov3d40hf6j30g7auo7afhp.mypinata.cloud/ipfs/QmYqX8D8SkaF5YcpaWMyi5xM43UEteFiSNKYsjLcdvCWud',
            });
          });
        });
      });

      describe('.Dweb', () => {
        describe('.IPFS', () => {
          it('checks return of IPFS hash for brad.zil', async () => {
            const resolution = new Resolution();
            const spies = mockAsyncMethods(resolution.zns, {
              allRecords: {
                'crypto.BCH.address': 'qrq4sk49ayvepqz7j7ep8x4km2qp8lauvcnzhveyu6',
                'crypto.BTC.address': '1EVt92qQnaLDcmVFtHivRJaunG2mf2C3mB',
                'crypto.DASH.address': 'XnixreEBqFuSLnDSLNbfqMH1GsZk7cgW4j',
                'crypto.ETH.address': '0x45b31e01AA6f42F0549aD482BE81635ED3149abb',
                'crypto.LTC.address': 'LetmswTW3b7dgJ46mXuiXMUY17XbK29UmL',
                'crypto.XMR.address':
              '447d7TVFkoQ57k3jm3wGKoEAkfEym59mK96Xw5yWamDNFGaLKW5wL2qK5RMTDKGSvYfQYVN7dLSrLdkwtKH3hwbSCQCu26d',
                'crypto.ZEC.address': 't1h7ttmQvWCSH1wfrcmvT4mZJfGw2DgCSqV',
                'crypto.ZIL.address': 'zil1yu5u4hegy9v3xgluweg4en54zm8f8auwxu0xxj',
                'ipfs.html.value': 'QmVaAtQbi3EtsfpKoLzALm6vXphdi2KjMgxEDKeGg6wHuK',
                'ipfs.redirect_domain.value': 'www.unstoppabledomains.com',
              },
            });
            const hash = await resolution.ipfsHash('brad.zil');
            expectSpyToBeCalled(spies);
            expect(hash).toBe('QmVaAtQbi3EtsfpKoLzALm6vXphdi2KjMgxEDKeGg6wHuK');
          });
        });

        describe('.Gundb', () => {
          it('should resolve gundb chat id', async () => {
            const eyes = mockAsyncMethods(resolution.cns, {
              get: {
                resolver: '0x878bC2f3f717766ab69C0A5f9A6144931E61AEd3',
                records: {
                  [standardKeys.gundb_username]:
                  '0x47992daf742acc24082842752fdc9c875c87c56864fee59d8b779a91933b159e48961566eec6bd6ce3ea2441c6cb4f112d0eb8e8855cc9cf7647f0d9c82f00831c',
                }
              },
            });
            const gundb = await resolution.chatId('homecakes.crypto');
            expectSpyToBeCalled(eyes);
            expect(gundb).toBe(
              '0x47992daf742acc24082842752fdc9c875c87c56864fee59d8b779a91933b159e48961566eec6bd6ce3ea2441c6cb4f112d0eb8e8855cc9cf7647f0d9c82f00831c',
            );
          });
        });
      });

      describe('.Verifications', () => {
        describe('.Twitter', () => {
          it('should return verified twitter handle', async () => {
            const resolution = new Resolution();
            const readerSpies = mockAsyncMethods(resolution.cns, {
              get: {
                resolver: '0xb66DcE2DA6afAAa98F2013446dBCB0f4B0ab2842',
                owner: '0x6EC0DEeD30605Bcd19342f3c30201DB263291589',
                records: {
                  [standardKeys.validation_twitter_username]:'0xcd2655d9557e5535313b47107fa8f943eb1fec4da6f348668062e66233dde21b413784c4060340f48da364311c6e2549416a6a23dc6fbb48885382802826b8111b',
                  [standardKeys.twitter_username]: 'derainberk'
                }
              },
            });
            const twitterHandle = await resolution.twitter(
              CryptoDomainWithTwitterVerification,
            );
            expectSpyToBeCalled(readerSpies);
            expect(twitterHandle).toBe('derainberk');
          });

          it('should throw unsupported method', async () => {
            const resolution = new Resolution();
            expectResolutionErrorCode(resolution.twitter('ryan.eth'), ResolutionErrorCode.UnsupportedMethod);
          });
        });
      });
    });
  });

  describe('.records', () => {
    it('works', async () => {
      const resolution = new Resolution();
      CryptoDomainWithAdaBchAddresses
      const eyes = mockAsyncMethods(resolution.cns!, {
        get: {
          owner: '0x6EC0DEeD30605Bcd19342f3c30201DB263291589',
          resolver: '0x878bC2f3f717766ab69C0A5f9A6144931E61AEd3',
          records: {
            'crypto.ADA.address': 'DdzFFzCqrhssjmxkChyAHE9MdHJkEc4zsZe7jgum6RtGzKLkUanN1kPZ1ipVPBLwVq2TWrhmPsAvArcr47Pp1VNKmZTh6jv8ctAFVCkj',
            'crypto.ETH.address': '',
          },
        },
      });
      expect(await resolution.records(CryptoDomainWithAdaBchAddresses, ['crypto.ADA.address', 'crypto.ETH.address'])).toEqual({
        "crypto.ADA.address": "DdzFFzCqrhssjmxkChyAHE9MdHJkEc4zsZe7jgum6RtGzKLkUanN1kPZ1ipVPBLwVq2TWrhmPsAvArcr47Pp1VNKmZTh6jv8ctAFVCkj",
        "crypto.ETH.address": "",
      })
      expectSpyToBeCalled([...eyes]);
    });
  });
});
