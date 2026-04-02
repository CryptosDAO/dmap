require('@nomicfoundation/hardhat-ethers')

require('./mock-deploy.js')

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    networks: {
        hardhat: {
            allowBlocksWithSameTimestamp: true
        }
    },
    paths: {
        sources: "core"
    },
    solidity: {
        version: '0.8.34',
        settings: {
            evmVersion: 'london',
            optimizer: {
                enabled: true,
                runs: 20000
            }
        }
    }
};
