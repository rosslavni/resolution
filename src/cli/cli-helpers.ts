import Resolution from '../Resolution';
import * as fs from 'fs';
import ConfigurationError, { ConfigurationErrorCode } from '../errors/configurationError';

export async function tryInfo(
  method,
  response,
  name: string,
): Promise<boolean> {
  const field = name;
  try {
    const resolvedPromise = await method();
    response[field] = resolvedPromise;
    return true;
  } catch (err) {
    response[field] = err.code;
    return false;
  }
}

export function commaSeparatedList(value, dummyPrevious) {
  return value.split(',').map((v: string) => v.toUpperCase());
}

export function signedInfuraLink(key: string): string {
  return `https://mainnet.infura.io/v3/${key}`;
}


const configObject = getConfig();
export function getEtheriumUrl(): string {
  switch (configObject.type) {
    case "infura":
      return signedInfuraLink(configObject.value);
    case "url":
      return configObject.value;
    default:
      return "https://main-rpc.linkpool.io/";
  } 
}

export function buildResolutionPackage() {
  return new Resolution({
    blockchain: {
      ens: getEtheriumUrl(),
      cns: getEtheriumUrl(),
    },
  });
}

export function parseConfig(value: string) {
  const words = value.split(':');
  return { type: words[0], value: words.slice(1).join(':')};
}

export function storeConfig(type: 'infura' | 'url', value: string) {
  fs.writeFile(`${process.env.HOME}/.resolution`, `${type}=${value}`, () =>
    console.log(`${type}=${value} record stored`),
  );
}

export function getConfig() {
  try {
    const config = fs
      .readFileSync(`${process.env.HOME}/.resolution`)
      .toString()
      .split('=');
    return { type: config[0], value: config[1] };
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn('Configuration file was not found. Default blockchain provider: "https://main-rpc.linkpool.io/" is being used');
      console.warn('This RPC is limited to 2,000 calls per 5 minutes. If that is exceeded, then the source IP address is blocked.')
      console.warn('To configure a different provider use -C flag ')
    }
    return {type: "unknown", value: ""};
  }
}
