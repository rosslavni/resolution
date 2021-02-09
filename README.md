# Resolution

[![NPM version](https://img.shields.io/npm/v/@unstoppabledomains/resolution.svg?style=flat)](https://www.npmjs.com/package/@unstoppabledomains/resolution)
![CI](https://github.com/unstoppabledomains/resolution/workflows/CI/badge.svg?branch=master)
[![Bundle Size Minified](https://img.shields.io/bundlephobia/min/@unstoppabledomains/resolution.svg)](https://bundlephobia.com/result?p=@unstoppabledomains/resolution)
[![Bundle Size Minified Zipped](https://img.shields.io/bundlephobia/minzip/@unstoppabledomains/resolution.svg)](https://bundlephobia.com/result?p=@unstoppabledomains/resolution)
[![Unstoppable Domains Documentation](https://img.shields.io/badge/Documentation-unstoppabledomains.com-blue)](https://docs.unstoppabledomains.com/)
[![Get help on Discord](https://img.shields.io/badge/Get%20help%20on-Discord-blueviolet)](https://discord.gg/b6ZVxSZ9Hn)

Resolution is a library for interacting with blockchain domain names. It can be used to retrieve [payment addresses](https://unstoppabledomains.com/features#Add-Crypto-Addresses), IPFS hashes for [decentralized websites](https://unstoppabledomains.com/features#Build-Website), and GunDB usernames for [decentralized chat](https://unstoppabledomains.com/chat).

Resolution is primarily built and maintained by [Unstoppable Domains](https://unstoppabledomains.com/).

Resolution supports decentralized domains across three main zones:

- Crypto Name Service (CNS)
  - `.crypto`
- Zilliqa Name Service (ZNS)
  - `.zil`
- Ethereum Name Service (ENS)
  - `.eth`
  - `.kred`
  - `.xyz`
  - `.luxe`

For more information, see our detailed [API Referrence](https://unstoppabledomains.github.io/resolution/).

## Installing Resolution

Resolution can be installed with either `yarn` or `npm`.

```shell
yarn add @unstoppabledomains/resolution
```

```shell
npm install @unstoppabledomains/resolution --save
```

If you're interested in resolving domains via the command line, see our [CLI section](#command-line-interface). 

## Using Resolution

Create a new project.

```shell
mkdir resolution && cd $_
yarn init -y
yarn add @unstoppabledomains/resolution
```

### Look up a domain's crypto address

Create a new file in your project, `address.js`.

```javascript
const { default: Resolution } = require('@unstoppabledomains/resolution');
const resolution = new Resolution();

function resolve(domain, currency) {
  resolution
    .addr(domain, currency)
    .then((address) => console.log(domain, 'resolves to', address))
    .catch(console.error);
}

resolve('brad.crypto', 'ETH');
resolve('brad.zil', 'ZIL');
```

Execute the script.

```shell
$ node address.js
brad.crypto resolves to 0x8aaD44321A86b170879d7A244c1e8d360c99DdA8
brad.zil resolves to zil1yu5u4hegy9v3xgluweg4en54zm8f8auwxu0xxj
```

### Find the IPFS hash for a decentralized website

Create a new file in your project, `ipfs_hash.js`.

```javascript
const { default: Resolution } = require('@unstoppabledomains/resolution');
const resolution = new Resolution();

function resolveIpfsHash(domain) {
  resolution
    .ipfsHash(domain)
    .then((hash) =>
      console.log(
        `You can access this website via a public IPFS gateway: https://gateway.ipfs.io/ipfs/${hash}`
      )
    )
    .catch(console.error);
}

resolveIpfsHash('homecakes.crypto');
```

Execute the script.

```shell
$ node ipfs_hash.js
You can access this website via a public IPFS gateway: https://gateway.ipfs.io/ipfs/QmVJ26hBrwwNAPVmLavEFXDUunNDXeFSeMPmHuPxKe6dJv
```

### Find a GunDB username

Create a new file in your project, `gundb.js`.

```javascript
const { default: Resolution } = require('@unstoppabledomains/resolution');
const resolution = new Resolution();

function resolveGunDbRecords(domain) {
  resolution
    .chatId(domain)
    .then((id) => console.log(`Domain ${domain} has a GunDB chat ID: ${id}`))
    .catch(console.error);
}

resolveGunDbRecords('homecakes.crypto');
```

Execute the script.

```shell
$ node gundb.js
Domain homecakes.crypto has a GunDB chat ID: 0x47992daf742acc24082842752fdc9c875c87c56864fee59d8b779a91933b159e48961566eec6bd6ce3ea2441c6cb4f112d0eb8e8855cc9cf7647f0d9c82f00831c
```

### Command Line Interface

To use resolution via the command line install the package globally.

```shell
yarn global add @unstoppabledomains/resolution
```

```shell
npm install -g @unstoppabledomains/resolution
```

You can specify what blockchain provider url to use via `--ethereum-url` flag.

For example:

```shell
resolution --ethereum-url https://main-rpc.linkpool.io -d udtestdev-usdt.crypto -a
```

Use the `-h` or `--help` flag to see all the available CLI options.

## Error Handling

When resolution encounters an error it returns the error code instead of stopping the process. Keep an eye out for return values like `RECORD_NOT_FOUND`.

## Development

Use these commands to set up a local development environment (**macOS Terminal** or **Linux shell**).

1. Install `nvm`
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.36.0/install.sh | bash
   ```

2. Install concrete version of `node.js`
    ```bash
    nvm install 12.12.0
    ```

3. Install `yarn`
    ```bash
    npm install -g yarn
    ```
4. Clone the repository
    ```bash
    git clone https://github.com/unstoppabledomains/resolution.git
    cd resolution
    ```

5. Install dependencies
    ```bash
    yarn install
    ```

### Internal network config

Internal [network config](src/main/resources/com/unstoppabledomains/config/network/network-config.json) 
can be updated by running `yarn network-config:pull` task and committing updated file.

## Free advertising for integrated apps

Once your app has a working Unstoppable Domains integration, [register it here](https://unstoppabledomains.com/app-submission). Registered apps appear on the Unstoppable Domains [homepage](https://unstoppabledomains.com/) and [Applications](https://unstoppabledomains.com/apps) page — putting your app in front of tens of thousands of potential customers per day.

Also, every week we select a newly-integrated app to feature in the Unstoppable Update newsletter. This newsletter is delivered to straight into the inbox of ~100,000 crypto fanatics — all of whom could be new customers to grow your business.

## Get help
[Join our discord community](https://discord.com/invite/b6ZVxSZ9Hn) and ask questions.  
