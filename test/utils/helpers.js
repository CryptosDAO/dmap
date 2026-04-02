const { ethers } = require("hardhat")
const { want } = require('./minihat')
const lib = require('../../dmap')

function padRight(addrStr) {
    // ethers v6: BigInt shift + toBeHex + zeroPadValue
    const shifted = BigInt(addrStr) << BigInt(96)
    const hexstr = ethers.toBeHex(shifted, 32)
    return hexstr
}

async function check_gas (gas, minGas, maxGas) {
  const gasNum = Number(gas)
  await want(gasNum).to.be.at.most(maxGas);
  if( gasNum < minGas ) {
    console.log("gas reduction: previous min=", minGas, " gas used=", gasNum);
  }
}


let testlib = {}
testlib.get = async (dmap, slot) => {
    // like lib.get, but calls dmap instead of direct storage access
    const pairabi = ["function pair(bytes32) returns (bytes32 meta, bytes32 data)"]
    const iface = new ethers.Interface(pairabi)
    const calldata = iface.encodeFunctionData("pair", [slot])
    const signer = dmap.runner || dmap.signer
    const addr = dmap.target || dmap.address
    const resdata = await signer.call({to: addr, data: calldata})
    const res = iface.decodeFunctionResult("pair", resdata)
    want(res).to.eql(await lib.get(dmap, slot))
    return res
}
// check that get, pair, and slot all return [meta, data]
const check_entry = async (dmap, usr, key, _meta, _data) => {
    const meta = typeof(_meta) == 'string' ? _meta : '0x'+_meta.toString('hex')
    const data = typeof(_data) == 'string' ? _data : '0x'+_data.toString('hex')
    const resZoneName = await lib.getByZoneAndName(dmap, usr, key)
    want(resZoneName[0]).to.eql(meta)
    want(resZoneName[1]).to.eql(data)
    want(resZoneName).to.eql([meta, data])

    const coder = ethers.AbiCoder.defaultAbiCoder()
    const keccak256 = ethers.keccak256
    const slot = keccak256(coder.encode(["address", "bytes32"], [usr, key]))
    const resGet = await testlib.get(dmap, slot)
    want(resGet[0]).to.eql(meta)
    want(resGet[1]).to.eql(data)
    want(resGet).to.eql([meta, data])

    const nextslot = ethers.toBeHex(BigInt(slot) + 1n, 32)
    want(await lib.slot(dmap, slot)).to.eql(meta)
    want(await lib.slot(dmap, nextslot)).to.eql(data)
}


module.exports = { padRight, check_gas, check_entry, testlib }
