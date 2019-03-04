// import { Zilliqa } from '@zilliqa-js/zilliqa'
import { nameHash, zilliqaRpcCall } from './zns-helpers'

const contractAddress = '837a5e8f3acf6f6effe6158c9b3d3cc25af14769'

export default ({ url = 'https://dev-api.zilliqa.com' } = {}) => {
  // const zilliqa = new Zilliqa(url)

  return async ({ name /* resolver = true */ }, next) => {
    if (!/\.zil$/.test(name)) return next()

    const namehash = nameHash(name.replace(/(\.zil)$/, ''))

    const znsState = await zilliqaRpcCall(
      url,
      'GetSmartContractState',
      contractAddress,
    )

    try {
      const [owner, prevOwner, resolver, ttl] = znsState
        .find(v => v.vname === 'registry')
        .value.find(v => v.key === namehash).val.arguments

      return {
        namehash,
        owner,
        addr: owner,
        prevOwner,
        resolver,
        ttl,
      }
    } catch (error) {
      // console.error(error)
    }
  }
}