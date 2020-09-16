import { Interface, JsonFragment } from '@ethersproject/abi';
import { Provider, RequestArguments, isNullAddress, EventData } from '../types';
import FetchProvider from '../FetchProvider';

/** @internal */
export default class Contract {
  readonly abi: JsonFragment[];
  readonly coder: Interface;
  readonly address: string;
  readonly provider: Provider;

  constructor(
    abi,
    address: string,
    provider: Provider,
  ) {
    this.abi = abi;
    this.address = address;
    this.provider = provider;
    this.coder = new Interface(this.abi);
  }

  async call(method: string, args: (string | string[])[]): Promise<ReadonlyArray<any>> {
    const inputParam = this.coder.encodeFunctionData(method, args);
    const response = await this.callEth(inputParam) as string;
    if (!response || response === '0x') {
      return [];
    }

    return this.coder.decodeFunctionResult(method, response);
  }

  async fetchLogs(eventName: string, tokenId: string): Promise<EventData[]> {
    const topic = this.coder.getEventTopic(eventName);
    const params = [
      {
        fromBlock: '0x960844',
        toBlock: 'latest',
        address: this.address,
        topics: [topic, tokenId]
      }
    ]
    const request: RequestArguments = {
      method: 'eth_getLogs',
      params
    };
    return await this.provider.request(request) as Promise<EventData[]>;
  }

  private async callEth(data: string): Promise<unknown> {
    const params = [
      {
        data,
        to: this.address,
      },
      'latest',
    ];
    const request: RequestArguments = {
      method: 'eth_call',
      params,
    };
    return await this.provider.request(request);
  }
}
