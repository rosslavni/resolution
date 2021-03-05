import { Hash, keccak_256 as sha3 } from 'js-sha3';
import { sha256 } from 'js-sha256';

export function eip137Namehash(domain: string): string {
  const arr = hashArray(domain, sha3);
  return arrayToHex(arr);
}

export function znsNamehash(domain: string): string {
  const arr = hashArray(domain, sha256);
  return arrayToHex(arr);
}

function hashArray(domain: string, hashingAlgo: Hash): number[] {
  if (!domain) {
    return Array.from(new Uint8Array(32));
  }

  const [label, ...remainder] = domain.split('.');
  const labelHash = hashingAlgo.array(label);
  const remainderHash = hashArray(remainder.join('.'), hashingAlgo);
  return hashingAlgo.array(new Uint8Array([...remainderHash, ...labelHash]));
}

function arrayToHex(arr) {
  return '0x' + Array.prototype.map.call(arr, x => ('00' + x.toString(16)).slice(-2)).join('');
}